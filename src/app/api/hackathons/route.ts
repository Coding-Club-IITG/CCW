/**
 * GET /api/hackathons - List active hackathons
 */

import { NextRequest, NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });

    const cacheKey = buildCacheKey("hackathons", {
      page,
      limit,
      status: "active",
    });

    const result = await cachedFetch(
      cacheKey,
      CACHE_TTLS.HACKATHONS,
      async () => {
        const [hackathons, total] = await Promise.all([
          Hackathon.find({ status: "active" })
            .sort({ deadline: 1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          Hackathon.countDocuments({ status: "active" }),
        ]);
        return { hackathons, total };
      },
    );

    return NextResponse.json(
      paginatedResponse(result.hackathons, result.total, page, limit),
    );
  } catch (err) {
    logger.error("Hackathon listing failed", {
      route: "GET /api/hackathons",
      operation: "list_hackathons",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
