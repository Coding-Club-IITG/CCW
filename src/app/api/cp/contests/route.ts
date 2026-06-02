import { NextRequest, NextResponse } from "next/server";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import Contest from "@/models/Contest";

export async function GET(request: NextRequest) {
  await dbConnect();

  const { searchParams } = new URL(request.url);
  const { page, limit, skip } = parsePagination(searchParams, { limit: 50 });

  const cacheKey = buildCacheKey("contests", { page, limit });

  const result = await cachedFetch(cacheKey, CACHE_TTLS.CONTESTS, async () => {
    const MAX_DURATION = 24 * 60 * 60;
    const filter = { durationSeconds: { $lte: MAX_DURATION } };

    const [contests, total] = await Promise.all([
      Contest.find(filter)
        .sort({ startTime: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Contest.countDocuments(filter),
    ]);

    const data = contests.map((c: any) => ({
      id: c._id.toString(),
      platform: c.platform,
      name: c.name,
      startTime: c.startTime.toISOString(),
      endTime: c.endTime.toISOString(),
      durationSeconds: c.durationSeconds,
      url: c.url,
    }));

    return { data, total };
  });

  return NextResponse.json(
    paginatedResponse(result.data, result.total, page, limit),
  );
}
