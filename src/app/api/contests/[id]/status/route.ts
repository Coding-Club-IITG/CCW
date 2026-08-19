import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { requireHead } from "@/lib/api/auth";
import dbConnect from "@/lib/mongodb";
import ContestMatch from "@/models/ContestMatch";
import { publishContest } from "@/lib/sse";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import {
  contestIdParamsSchema,
  contestStatusSchema,
} from "@/lib/api/schemas/contestRoute";

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

    contest.status = newStatus;
    await contest.save();

    // Publish SSE update
    try {
      await publishContest(contest._id.toString(), {
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

    return jsonOk(contest);
  } catch (error) {
    logger.error("Contest status update failed", {
      route: "PATCH /api/contests/[id]/status",
      operation: "update_status",
      ...errorToLogMetadata(error),
    });
    return jsonError("INTERNAL_ERROR", "Unable to update contest status.");
  }
}
