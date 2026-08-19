import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseRouteParams, toBsonSafe } from "@/lib/api/result";
import { requireHead } from "@/lib/api/auth";
import { objectIdParamsSchema } from "@/lib/api/schemas/boundary";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import Project from "@/models/Project";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);

    const validatedParams = parseRouteParams(
      await context.params,
      objectIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;
    await dbConnect();
    const project = await Project.findById(id).lean();
    if (!project) {
      return jsonError("NOT_FOUND", "Project not found.");
    }

    return jsonOk({ project: toBsonSafe(project) });
  } catch (err) {
    logger.error("[Admin Projects API] GET [id] error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
