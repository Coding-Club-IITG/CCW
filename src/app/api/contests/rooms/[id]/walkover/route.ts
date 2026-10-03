import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { auditActor, insertAuditEvent } from "@/lib/audit/index";
import { summarizeContest } from "@/lib/audit/summary";
import { requireHead } from "@/lib/auth/session";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  contestIdParamsSchema,
  contestWalkoverSchema,
} from "@/lib/api/schemas/contestRoute";
import {
  processWalkover,
  processNullifyMatch,
  type DeferredBracketEffect,
} from "@/lib/contests/bracket";
import { connectMongoDB } from "@/lib/db/mongodb";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

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

    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const adminUserId = authorization.data.user.id;
    const actor = authorization.data.user;

    const body = await parseJson(request, contestWalkoverSchema);
    if (!body.ok) return jsonResult(body);
    const { winnerTeamId, note, action = "walkover" } = body.data;

    if (action === "walkover" && !winnerTeamId) {
      return jsonError(
        "VALIDATION_ERROR",
        "Winner team ID is required for a walkover.",
      );
    }

    await connectMongoDB();
    const { snapshot, deferredEffects } = await mongoose.connection.transaction(
      async (transaction) => {
        const effects: DeferredBracketEffect[] = [];
        const processed =
          action === "nullify"
            ? await processNullifyMatch(roomId, note, adminUserId, effects)
            : await processWalkover(
                roomId,
                winnerTeamId!,
                note,
                adminUserId,
                effects,
              );
        await insertAuditEvent(
          {
            actor: auditActor(actor),
            category: "contests" as const,
            action: "walkover" as const,
            operation:
              action === "nullify" ? "contests.nullify" : "contests.walkover",
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
