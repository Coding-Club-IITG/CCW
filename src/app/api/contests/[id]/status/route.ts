import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeContest } from "@/lib/audit/summary";
import { requireHead } from "@/lib/api/auth";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  contestIdParamsSchema,
  contestStatusSchema,
} from "@/lib/api/schemas/contestRoute";
import { publishContest } from "@/lib/contests/events";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import ContestMatch from "@/models/ContestMatch";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const validatedParams = parseRouteParams(
      await params,
      contestIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;

    const body = await parseJson(request, contestStatusSchema);
    if (!body.ok) return jsonResult(body);
    const { action } = body.data;

    await dbConnect();
    const contest = await ContestMatch.findById(id);
    if (!contest) {
      return jsonError("NOT_FOUND", "Contest not found");
    }

    let newStatus: "draft" | "registration" | "active" | "completed";

    if (action === "publish") {
      if (contest.status !== "draft") {
        return jsonError("VALIDATION_ERROR", "Invalid status transition");
      }
      newStatus = "registration";
    } else if (action === "start") {
      if (contest.status !== "registration") {
        return jsonError("VALIDATION_ERROR", "Invalid status transition");
      }
      newStatus = "active";
    } else if (action === "complete") {
      if (contest.status !== "active") {
        return jsonError("VALIDATION_ERROR", "Invalid status transition");
      }
      newStatus = "completed";
    } else {
      return jsonError("VALIDATION_ERROR", "Invalid status transition");
    }

    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await ContestMatch.findById(id).session(transaction);
        if (!current)
          throw new Error("Contest disappeared during status update.");
        const before = current.toObject();
        current.status = newStatus;
        await current.save({ session: transaction });
        return {
          result: current,
          audit: {
            actor: auditActor(authorization.data.user),
            category: "contests" as const,
            action: "status_change" as const,
            operation: `contests.status.${action}`,
            target: { type: "contest", id, label: current.name },
            before: summarizeContest(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizeContest(
              current.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    // Publish SSE update
    try {
      await publishContest(saved._id.toString(), {
        type: "contest.status_change",
        status: newStatus,
      });
    } catch (sseError) {
      logger.warn("Contest status SSE publish failed", {
        route: "PATCH /api/contests/[id]/status",
        operation: "publish_status_change",
        resourceId: id,
        ...errorToLogMetadata(sseError),
      });
    }

    return jsonOk(saved);
  } catch (error) {
    logger.error("Contest status update failed", {
      route: "PATCH /api/contests/[id]/status",
      operation: "update_status",
      ...errorToLogMetadata(error),
    });
    return jsonError("INTERNAL_ERROR", "Unable to update contest status.");
  }
}
