import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import Project from "@/models/Project";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { cachedFetch, buildCacheKey, CACHE_TTLS } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });

    const cacheKey = buildCacheKey("admin:projects", { page, limit });

    const result = await cachedFetch(
      cacheKey,
      CACHE_TTLS.PROJECTS,
      async () => {
        const [projects, total] = await Promise.all([
          Project.find({})
            .select(
              "title description date module status repoLink coverImage coverFocalPoint tags createdAt updatedAt",
            )
            .sort({ date: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
          Project.countDocuments({}),
        ]);
        return { projects: JSON.parse(JSON.stringify(projects)), total };
      },
    );

    return NextResponse.json(
      paginatedResponse(result.projects, result.total, page, limit),
    );
  } catch (err) {
    logger.error("[Admin Projects API] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
