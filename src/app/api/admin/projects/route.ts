import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  parseSearchParams,
  toBsonSafe,
  type JsonValue,
} from "@/lib/api/result";
import { paginationQuerySchema } from "@/lib/api/schemas/boundary";
import { requireHead } from "@/lib/api/auth";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import Project from "@/models/Project";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { cachedFetch, buildCacheKey, CACHE_TTLS } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(searchParams, paginationQuerySchema);
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });

    const cacheKey = buildCacheKey("admin:projects", { page, limit });

    const result = await cachedFetch(
      cacheKey,
      CACHE_TTLS.PROJECTS,
      async () => {
        const [projects, total] = await Promise.all([
          Project.find({})
            .select(
              "title description date module status repoLink liveUrl coverImage coverFocalPoint tags createdAt updatedAt",
            )
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          Project.countDocuments({}),
        ]);
        return { projects: toBsonSafe(projects) as JsonValue[], total };
      },
    );

    return jsonOk(
      paginatedResponse(result.projects, result.total, page, limit),
    );
  } catch (err) {
    logger.error("[Admin Projects API] GET error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
