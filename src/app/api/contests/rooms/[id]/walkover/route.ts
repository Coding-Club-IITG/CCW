import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { auditActor, insertAuditEvent } from "@/lib/audit";
import { summarizeContest } from "@/lib/audit/summary";
import { requireHead } from "@/lib/api/auth";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  contestIdParamsSchema,
  contestWalkoverSchema,
} from "@/lib/api/schemas/contestRoute";
import {
  processWalkover,
  type DeferredBracketEffect,
} from "@/lib/contests/bracket";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const validatedParams = parseRouteParams(
      await params,
      contestIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id: roomId } = validatedParams.data;

    const isDev = webEnv.NODE_ENV === "development";
    const testUserId = request.headers.get("x-test-user-id");
    let adminUserId = "dev-bypass";
    let actor = {
      id: testUserId || "dev-bypass",
      name: "Development user",
      access: "Admin",
    };
    if (!isDev || !testUserId) {
      const authorization = await requireHead(request);
      if (!authorization.ok) return jsonResult(authorization);
      adminUserId = authorization.data.user.id;
      actor = authorization.data.user;
    }

    const body = await parseJson(request, contestWalkoverSchema);
    if (!body.ok) return jsonResult(body);
    const { winnerTeamId, note } = body.data;

    await dbConnect();
    const { snapshot, deferredEffects } = await mongoose.connection.transaction(
      async (transaction) => {
        const effects: DeferredBracketEffect[] = [];
        const processed = await processWalkover(
          roomId,
          winnerTeamId,
          note,
          adminUserId,
          effects,
        );
        await insertAuditEvent(
          {
            actor: auditActor(actor),
            category: "contests" as const,
            action: "walkover" as const,
            operation: "contests.walkover",
            target: {
              type: "contest-room",
              id: roomId,
              label: "Tournament match",
            },
            after: summarizeContest({
              status: "ended",
              participantCount: processed.nodes.length,
            }),
          },
          transaction,
        );
        return { snapshot: processed, deferredEffects: effects };
      },
    );
    for (const effect of deferredEffects) {
      try {
        await effect();
      } catch (error) {
        logger.error("Post-commit walkover side effect failed", {
          route: "POST /api/contests/rooms/[id]/walkover",
          operation: "process_walkover_side_effect",
          ...errorToLogMetadata(error),
        });
      }
    }
    return jsonOk({ success: true, bracket: snapshot });
  } catch (error) {
    logger.error("Contest walkover processing failed", {
      route: "POST /api/contests/rooms/[id]/walkover",
      operation: "process_walkover",
      ...errorToLogMetadata(error),
    });
    return jsonError("VALIDATION_ERROR", "Unable to process the walkover.");
  }
}
