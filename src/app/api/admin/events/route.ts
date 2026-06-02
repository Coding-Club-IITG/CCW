import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import Event from "@/models/Event";
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

    const cacheKey = buildCacheKey("admin:events", { page, limit });

    const result = await cachedFetch(cacheKey, CACHE_TTLS.EVENTS, async () => {
      const [events, total] = await Promise.all([
        Event.find({})
          .select(
            "title shortDescription poster startDate endDate module tags recurrenceType recurrenceCount createdAt updatedAt",
          )
          .sort({ startDate: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Event.countDocuments({}),
      ]);
      return { events: JSON.parse(JSON.stringify(events)), total };
    });

    return NextResponse.json(
      paginatedResponse(result.events, result.total, page, limit),
    );
  } catch (err) {
    logger.error("[Admin Events API] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
