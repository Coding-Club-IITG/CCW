import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { requireHead } from "@/lib/api/auth";
import { generateBracket, getBracketSnapshot } from "@/lib/bracket";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { webEnv } from "@/lib/env/web";
import { parseRouteParams } from "@/lib/api/result";
import { contestIdParamsSchema } from "@/lib/api/schemas/contestRoute";

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
    if (!isDev || !testUserId) {
      const authorization = await requireHead(request);
      if (!authorization.ok) return jsonResult(authorization);
    }

    const snapshot = await generateBracket(id);
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
