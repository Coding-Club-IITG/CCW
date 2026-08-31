/**
 * GET /api/events/[slug]/ics - iCalendar feed for one published event
 */

import { NextRequest } from "next/server";
import { jsonError, jsonResult } from "@/lib/api/result.server";
import { parseRouteParams } from "@/lib/api/result";
import { slugParamsSchema } from "@/lib/api/schemas/boundary";
import { buildEventIcs } from "@/lib/ics";
import dbConnect from "@/lib/mongodb";
import { absoluteUrl } from "@/lib/seo";
import { errorToLogMetadata, logger } from "@/lib/utils";
import Event from "@/models/Event";
import CalendarEvent from "@/models/CalendarEvent";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      slugParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug } = validatedParams.data;

    await dbConnect();
    void CalendarEvent;

    const event = await Event.findOne({ slug, status: "published" })
      .populate("calendarEventId", "location")
      .lean();

    if (!event) {
      return jsonError("NOT_FOUND", "Event not found.");
    }

    const calendar = event.calendarEventId as { location?: string } | null;

    const body = buildEventIcs({
      uid: `${event.slug}@codingclub.in`,
      title: event.title,
      description: event.shortDescription || undefined,
      location: calendar?.location || undefined,
      url: absoluteUrl(`/events/${event.slug}`),
      startAt: new Date(event.startDate),
      endAt: event.endDate ? new Date(event.endDate) : undefined,
      allDay: Boolean(event.allDay),
      recurrenceType: event.recurrenceType,
      recurrenceCount: event.recurrenceCount,
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    logger.error("Event calendar export failed", {
      route: "GET /api/events/[slug]/ics",
      operation: "export_event_ics",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
