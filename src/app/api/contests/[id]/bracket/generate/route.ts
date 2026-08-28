import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { auditActor, insertAuditEvent } from "@/lib/audit";
import { summarizeContest } from "@/lib/audit/summary";
import { requireHead } from "@/lib/api/auth";
import { parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { contestIdParamsSchema } from "@/lib/api/schemas/contestRoute";
import {
  generateBracket,
  getBracketSnapshot,
  type DeferredBracketEffect,
} from "@/lib/contests/bracket";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import ContestMatch from "@/models/ContestMatch";

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
    const { id } = validatedParams.data;

    const isDev = webEnv.NODE_ENV === "development";
    const testUserId = request.headers.get("x-test-user-id");
    let actor = {
      id: testUserId || "dev-bypass",
      name: "Development user",
      access: "Admin",
    };
    if (!isDev || !testUserId) {
      const authorization = await requireHead(request);
      if (!authorization.ok) return jsonResult(authorization);
      actor = authorization.data.user;
    }

    await dbConnect();
    const { snapshot, deferredEffects } = await mongoose.connection.transaction(
      async (transaction) => {
        const effects: DeferredBracketEffect[] = [];
        const generated = await generateBracket(id, undefined, effects);
        const contest = await ContestMatch.findById(id).lean();
        await insertAuditEvent(
          {
            actor: auditActor(actor),
            category: "contests" as const,
            action: "generate_bracket" as const,
            operation: "contests.bracket.generate",
            target: {
              type: "contest",
              id,
              label: contest?.name || "Tournament",
            },
            after: summarizeContest({
              ...(contest ?? {}),
              problemCount: generated.nodes.length,
            }),
          },
          transaction,
        );
        return { snapshot: generated, deferredEffects: effects };
      },
    );
    for (const effect of deferredEffects) {
      try {
        await effect();
      } catch (error) {
        logger.error("Post-commit bracket side effect failed", {
          route: "POST /api/contests/[id]/bracket/generate",
          operation: "generate_bracket_side_effect",
          ...errorToLogMetadata(error),
        });
      }
    }
    return jsonOk({ success: true, bracket: snapshot });
  } catch (error) {
    logger.error("Contest bracket generation failed", {
      route: "POST /api/contests/[id]/bracket/generate",
      operation: "generate_bracket",
      ...errorToLogMetadata(error),
    });
    return jsonError(
      "VALIDATION_ERROR",
      "Unable to generate the contest bracket.",
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const validatedParams = parseRouteParams(
      await params,
      contestIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;
    const snapshot = await getBracketSnapshot(id);
    return jsonOk(snapshot);
  } catch (error) {
    logger.error("Contest bracket lookup failed", {
      route: "GET /api/contests/[id]/bracket/generate",
      operation: "get_bracket",
      ...errorToLogMetadata(error),
    });
    return jsonError("NOT_FOUND", "Contest bracket not found.");
  }
}
