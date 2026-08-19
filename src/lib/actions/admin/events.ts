"use server";

import { err as appError, ok, type JsonValue } from "@/lib/api/result";

import { defineAction } from "@/lib/actions/defineAction";
import { toBsonSafe } from "@/lib/api/result";

export const getEvents = defineAction("getEvents", getEventsAction);
export const getEvent = defineAction("getEvent", getEventAction);
export const createEvent = defineAction("createEvent", createEventAction);
export const createPublicEvent = defineAction(
  "createPublicEvent",
  createPublicEventAction,
);
export const updateEvent = defineAction("updateEvent", updateEventAction);
export const setPublicEventStatus = defineAction(
  "setPublicEventStatus",
  setPublicEventStatusAction,
);
export const syncPublicEventSchedule = defineAction(
  "syncPublicEventSchedule",
  syncPublicEventScheduleAction,
);
export const deleteEvent = defineAction("deleteEvent", deleteEventAction);

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { buildScheduleFingerprint } from "@/lib/calendar";
import { canPublishCalendarEvent } from "@/lib/access/calendar";
import {
  EVENT_PUBLICATION_STATUSES,
  type EventPublicationStatus,
  type ModuleName,
} from "@/lib/constants";
import { invalidateCache } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { isHead } from "@/lib/access/roles";
import { parseManagedModules } from "@/lib/roles";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { findUniqueSlug, titleToSlug } from "@/lib/slug";
import {
  parseImageFocalPoint,
  type ImageFocalPoint,
} from "@/lib/imageFocalPoint";
import CalendarEvent from "@/models/CalendarEvent";
import Event from "@/models/Event";

type SessionUser = { id: string; access?: string; managedModules?: unknown };
type PublicEventInput = {
  title: string;
  shortDescription: string;
  description: string;
  poster: string;
  posterFocalPoint: ImageFocalPoint;
  tags: string[];
};

type PublicEventDto = { _id: string; [key: string]: JsonValue };

function publicEventDto(value: unknown): PublicEventDto {
  const serialized = toBsonSafe(value);
  if (
    !serialized ||
    typeof serialized !== "object" ||
    Array.isArray(serialized) ||
    typeof serialized._id !== "string"
  ) {
    throw new Error("Unable to serialize public event");
  }
  return serialized as PublicEventDto;
}

async function currentAdmin(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user as SessionUser | undefined;
  return user && isHead(user.access) ? user : null;
}

function targetOf(calendar: { scope: string; module?: string | null }) {
  return calendar.scope === "module"
    ? ({ scope: "module", module: calendar.module ?? "" } as const)
    : ({ scope: "general" } as const);
}

function mayPublish(
  user: SessionUser,
  calendar: { scope: string; module?: string | null },
) {
  return canPublishCalendarEvent(
    user.access,
    parseManagedModules(user.managedModules),
    targetOf(calendar),
  );
}

function value(source: FormData | Record<string, unknown>, key: string) {
  const raw = source instanceof FormData ? source.get(key) : source[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function parsePublicInput(source: FormData | Record<string, unknown>) {
  const rawTags =
    source instanceof FormData ? value(source, "tags").split(",") : source.tags;
  const data: PublicEventInput = {
    title: value(source, "title"),
    shortDescription: value(source, "shortDescription"),
    description: value(source, "description"),
    poster: value(source, "poster"),
    posterFocalPoint: parseImageFocalPoint(
      source instanceof FormData
        ? {
            x: source.get("posterFocalPointX"),
            y: source.get("posterFocalPointY"),
          }
        : source.posterFocalPoint,
    ),
    tags: Array.isArray(rawTags)
      ? rawTags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
  };
  if (!data.title || !data.description || !data.poster) {
    return appError(
      "VALIDATION_ERROR",
      "Title, description, and poster are required.",
    );
  }
  if (data.title.length > 200 || data.shortDescription.length > 200) {
    return appError(
      "VALIDATION_ERROR",
      "Title and short description must be 200 characters or fewer.",
    );
  }
  if (data.description.length > 50_000) {
    return appError("VALIDATION_ERROR", "Description is too long.");
  }
  return ok(data);
}

function scheduleValues(calendar: {
  title: string;
  scope: "general" | "module";
  module?: ModuleName;
  allDay: boolean;
  startAt: Date;
  endAt?: Date;
  recurrenceType: "none" | "daily" | "weekly" | "biweekly" | "monthly";
  recurrenceCount: number;
}) {
  return {
    startDate: calendar.startAt,
    endDate: calendar.endAt,
    allDay: calendar.allDay,
    module: calendar.module,
    recurrenceType: calendar.recurrenceType,
    recurrenceCount: calendar.recurrenceCount,
    scheduleFingerprint: buildScheduleFingerprint(calendar),
  };
}

async function refresh(eventSlug?: string, calendarId?: string) {
  await Promise.all([
    invalidateCache("events"),
    invalidateCache("admin:events"),
    invalidateCache("calendar"),
  ]);
  revalidatePath("/events");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/events");
  revalidatePath("/internal/calendar");
  if (eventSlug) revalidatePath(`/events/${eventSlug}`);
  if (calendarId) revalidatePath(`/internal/calendar/${calendarId}`);
}

async function uniqueEventSlug(base: string, currentId?: string) {
  return findUniqueSlug(base, async (slug) =>
    Boolean(
      await Event.exists({
        slug,
        ...(currentId ? { _id: { $ne: currentId } } : {}),
      }),
    ),
  );
}

async function getEventsAction() {
  try {
    if (!(await currentAdmin()))
      return appError("UNAUTHENTICATED", "Unauthorized");
    await dbConnect();
    const events = await Event.find({}).sort({ updatedAt: -1 }).lean();
    return ok({ events: events.map(publicEventDto) });
  } catch (error) {
    logger.error("Public event administration listing failed", {
      operation: "list_public_events",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function getEventAction(id: string) {
  try {
    if (!(await currentAdmin()))
      return appError("UNAUTHENTICATED", "Unauthorized");
    await dbConnect();
    const event = mongoose.isValidObjectId(id)
      ? await Event.findById(id).lean()
      : null;
    return event
      ? ok({ event: publicEventDto(event) })
      : appError("NOT_FOUND", "Event not found.");
  } catch (error) {
    logger.error("Public event lookup failed", {
      operation: "get_public_event",
      eventId: id,
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function createEventAction() {
  return appError("INTERNAL_ERROR", "An unexpected error occurred.");
}

async function createPublicEventAction(
  calendarEventId: string,
  input: FormData | Record<string, unknown>,
  status: EventPublicationStatus = "draft",
) {
  try {
    const user = await currentAdmin();
    if (!user) return appError("UNAUTHENTICATED", "Unauthorized");
    if (
      !mongoose.isValidObjectId(calendarEventId) ||
      !EVENT_PUBLICATION_STATUSES.includes(status)
    ) {
      return appError("VALIDATION_ERROR", "Invalid public event request.");
    }
    const parsed = parsePublicInput(input);
    if (!parsed.ok) return parsed;
    await dbConnect();
    const calendar = await CalendarEvent.findById(calendarEventId);
    if (!calendar) return appError("NOT_FOUND", "Calendar event not found.");
    if (!mayPublish(user, calendar)) return appError("FORBIDDEN", "Forbidden");
    if (calendar.publicEventId || (await Event.exists({ calendarEventId }))) {
      return appError("INTERNAL_ERROR", "An unexpected error occurred.");
    }

    const dbSession = await mongoose.startSession();
    const eventId = new mongoose.Types.ObjectId();
    const slug = await uniqueEventSlug(
      titleToSlug(parsed.data.title) || `event-${String(eventId)}`,
    );
    let createdId = "";
    try {
      await dbSession.withTransaction(async () => {
        const [event] = await Event.create(
          [
            {
              _id: eventId,
              ...parsed.data,
              slug,
              ...scheduleValues(calendar),
              calendarEventId: calendar._id,
              status,
              publishedAt: status === "published" ? new Date() : null,
            },
          ],
          { session: dbSession },
        );
        createdId = String(event._id);
        calendar.publicEventId = event._id;
        await calendar.save({ session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }
    const event = await Event.findById(createdId).lean();
    await refresh(event?.slug, calendarEventId);
    return ok(publicEventDto(event));
  } catch (error) {
    logger.error("Public event creation failed", {
      operation: "create_public_event",
      calendarEventId,
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function updateEventAction(
  id: string,
  input: FormData | Record<string, unknown>,
) {
  try {
    const user = await currentAdmin();
    if (!user) return appError("UNAUTHENTICATED", "Unauthorized");
    const parsed = parsePublicInput(input);
    if (!parsed.ok) return parsed;
    await dbConnect();
    const event = mongoose.isValidObjectId(id)
      ? await Event.findById(id)
      : null;
    if (!event) return appError("NOT_FOUND", "Event not found.");
    const calendar = await CalendarEvent.findById(event.calendarEventId);
    if (!calendar || !mayPublish(user, calendar))
      return appError("FORBIDDEN", "Forbidden");
    if (event.title !== parsed.data.title) {
      event.slug = await uniqueEventSlug(
        titleToSlug(parsed.data.title) || `event-${String(event._id)}`,
        String(event._id),
      );
    }
    event.set(parsed.data);
    await event.save();
    await refresh(event.slug, String(calendar._id));
    return ok({ event: publicEventDto(event.toObject()) });
  } catch (error) {
    logger.error("Public event update failed", {
      operation: "update_public_event",
      eventId: id,
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function setPublicEventStatusAction(
  id: string,
  status: EventPublicationStatus,
) {
  try {
    const user = await currentAdmin();
    if (!user) return appError("UNAUTHENTICATED", "Unauthorized");
    if (!EVENT_PUBLICATION_STATUSES.includes(status))
      return appError("VALIDATION_ERROR", "Invalid publication status.");
    await dbConnect();
    const event = mongoose.isValidObjectId(id)
      ? await Event.findById(id)
      : null;
    if (!event) return appError("NOT_FOUND", "Event not found.");
    const calendar = await CalendarEvent.findById(event.calendarEventId);
    if (!calendar || !mayPublish(user, calendar))
      return appError("FORBIDDEN", "Forbidden");
    event.status = status;
    if (status === "published" && !event.publishedAt)
      event.publishedAt = new Date();
    await event.save();
    await refresh(event.slug, String(calendar._id));
    return ok(publicEventDto(event.toObject()));
  } catch (error) {
    logger.error("Public event status update failed", {
      operation: "set_public_event_status",
      eventId: id,
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function syncPublicEventScheduleAction(id: string) {
  try {
    const user = await currentAdmin();
    if (!user) return appError("UNAUTHENTICATED", "Unauthorized");
    await dbConnect();
    const event = mongoose.isValidObjectId(id)
      ? await Event.findById(id)
      : null;
    if (!event) return appError("NOT_FOUND", "Event not found.");
    const calendar = await CalendarEvent.findById(event.calendarEventId);
    if (!calendar || !mayPublish(user, calendar))
      return appError("FORBIDDEN", "Forbidden");
    event.set(scheduleValues(calendar));
    await event.save();
    await refresh(event.slug, String(calendar._id));
    return ok(publicEventDto(event.toObject()));
  } catch (error) {
    logger.error("Public event schedule sync failed", {
      operation: "sync_public_event_schedule",
      eventId: id,
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function deleteEventAction() {
  return appError("INTERNAL_ERROR", "An unexpected error occurred.");
}
