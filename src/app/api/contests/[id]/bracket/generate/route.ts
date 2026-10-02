import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { auditActor, insertAuditEvent } from "@/lib/audit/index";
import { summarizeContest } from "@/lib/audit/summary";
import { requireHead } from "@/lib/auth/session";
import { parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { contestIdParamsSchema } from "@/lib/api/schemas/contestRoute";
import {
  generateBracket,
  type DeferredBracketEffect,
} from "@/lib/contests/bracket";
import { connectMongoDB } from "@/lib/db/mongodb";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import ContestMatch from "@/models/ContestMatch";

import { GET as getAuthorizedSnapshot } from "../snapshot/route";

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

    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const actor = authorization.data.user;

    await connectMongoDB();
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
  context: { params: Promise<{ id: string }> },
) {
  return getAuthorizedSnapshot(request, context);
}
