import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  parseSearchParams,
  toBsonSafe,
  type JsonValue,
} from "@/lib/api/result";
import { paginationQueryFields } from "@/lib/api/schemas/boundary";
import { requireHead } from "@/lib/api/auth";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import Event from "@/models/Event";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { cachedFetch, buildCacheKey, CACHE_TTLS } from "@/lib/cache";
import {
  EVENT_PUBLICATION_STATUSES,
  type EventPublicationStatus,
} from "@/lib/constants";
import { getPublishableEventModules } from "@/lib/access/calendar";
import { parseManagedModules } from "@/lib/roles";

export async function GET(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const user = authorization.data.user;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(
      searchParams,
      z.object({
        ...paginationQueryFields,
        status: z.enum(EVENT_PUBLICATION_STATUSES).optional(),
      }),
    );
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });
    const status: EventPublicationStatus | undefined = query.data.status;
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
      return { events: toBsonSafe(events) as JsonValue[], total };
    });

    return jsonOk(paginatedResponse(result.events, result.total, page, limit));
  } catch (err) {
    logger.error("[Admin Events API] GET error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
