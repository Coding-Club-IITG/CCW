import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { requireHead } from "@/lib/api/auth";
import { processWalkover } from "@/lib/contests/bracket";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { webEnv } from "@/lib/env/web";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import {
  contestIdParamsSchema,
  contestWalkoverSchema,
} from "@/lib/api/schemas/contestRoute";

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
    if (!isDev || !testUserId) {
      const authorization = await requireHead(request);
      if (!authorization.ok) return jsonResult(authorization);
      adminUserId = authorization.data.user.id;
    }

    const body = await parseJson(request, contestWalkoverSchema);
    if (!body.ok) return jsonResult(body);
    const { winnerTeamId, note } = body.data;

    const snapshot = await processWalkover(
      roomId,
      winnerTeamId,
      note,
      adminUserId,
    );
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
