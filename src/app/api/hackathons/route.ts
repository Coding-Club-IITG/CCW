/**
 * GET /api/hackathons - List active hackathons
 */

import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseSearchParams } from "@/lib/api/result";
import { paginationQuerySchema } from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { errorToLogMetadata, logger } from "@/lib/utils";
import Hackathon from "@/models/Hackathon";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(searchParams, paginationQuerySchema);
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });

    const cacheKey = buildCacheKey("hackathons", {
      page,
      limit,
      status: "active",
      sort: "deadline_desc",
    });

    const result = await cachedFetch(
      cacheKey,
      CACHE_TTLS.HACKATHONS,
      async () => {
        const [hackathons, total] = await Promise.all([
          Hackathon.find({ status: "active" })
            .sort({ deadline: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          Hackathon.countDocuments({ status: "active" }),
        ]);
        return { hackathons, total };
      },
    );

    return jsonOk(
      paginatedResponse(result.hackathons, result.total, page, limit),
    );
  } catch (err) {
    logger.error("Hackathon listing failed", {
      route: "GET /api/hackathons",
      operation: "list_hackathons",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
