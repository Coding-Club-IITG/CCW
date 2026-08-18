import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import Event from "@/models/Event";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { cachedFetch, buildCacheKey, CACHE_TTLS } from "@/lib/cache";
import {
  EVENT_PUBLICATION_STATUSES,
  type EventPublicationStatus,
} from "@/lib/constants";
import { getPublishableEventModules } from "@/lib/calendarAccess";
import { parseManagedModules } from "@/lib/roles";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });
    const status = searchParams.get("status") as EventPublicationStatus | null;
    const modules = getPublishableEventModules(
      user.access,
      parseManagedModules(user.managedModules),
    );
    const filter = {
      ...(status && EVENT_PUBLICATION_STATUSES.includes(status)
        ? { status }
        : {}),
      ...(modules ? { module: { $in: modules } } : {}),
    };

    const cacheKey = buildCacheKey("admin:events", {
      page,
      limit,
      status: status ?? undefined,
      modules: modules?.sort().join(","),
    });

    const result = await cachedFetch(cacheKey, CACHE_TTLS.EVENTS, async () => {
      const [events, total] = await Promise.all([
        Event.find(filter)
          .select(
            "title slug shortDescription poster posterFocalPoint startDate endDate allDay module tags recurrenceType recurrenceCount status publishedAt calendarEventId scheduleFingerprint createdAt updatedAt",
          )
          .sort({ startDate: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Event.countDocuments(filter),
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
