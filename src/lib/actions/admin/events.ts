"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { canPublishCalendarEvent } from "@/lib/access/calendar";
import { isHead } from "@/lib/access/roles";
import { defineAction } from "@/lib/actions/defineAction";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizePublicContent } from "@/lib/audit/summary";
import {
  err as appError,
  ok,
  toBsonSafe,
  type JsonValue,
} from "@/lib/api/result";
import { auth } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";
import { buildScheduleFingerprint } from "@/lib/calendar";
import {
  EVENT_PUBLICATION_STATUSES,
  type EventPublicationStatus,
  type ModuleName,
} from "@/lib/constants";
import {
  parseImageFocalPoint,
  type ImageFocalPoint,
} from "@/lib/imageFocalPoint";
import dbConnect from "@/lib/mongodb";
import { parseManagedModules } from "@/lib/roles";
import { normalizeTags, parseTagList } from "@/lib/tagUtils";
import { findUniqueSlug, titleToSlug } from "@/lib/slug";
import { errorToLogMetadata, logger } from "@/lib/utils";
import CalendarEvent from "@/models/CalendarEvent";
import Event from "@/models/Event";

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

type SessionUser = {
  id: string;
  name?: string;
  access?: string;
  managedModules?: unknown;
};
type PublicEventInput = {
  title: string;
  shortDescription: string;
  description: string;
  poster: string;
  posterFocalPoint: ImageFocalPoint;
  tags: string[];
  publicAudience: string;
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
    source instanceof FormData
      ? parseTagList(value(source, "tags"))
      : source.tags;
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
    tags: Array.isArray(rawTags) ? normalizeTags(rawTags) : [],
    publicAudience: value(source, "publicAudience"),
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
  if (data.publicAudience.length > 80) {
    return appError(
      "VALIDATION_ERROR",
      "Open to must be 80 characters or fewer.",
    );
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
      await auditedTransaction(dbSession, async (transaction) => {
        const currentCalendar =
          await CalendarEvent.findById(calendarEventId).session(transaction);
        if (!currentCalendar)
          throw new Error("Calendar event disappeared during publication.");
        const [event] = await Event.create(
          [
            {
              _id: eventId,
              ...parsed.data,
              slug,
              ...scheduleValues(currentCalendar),
              calendarEventId: currentCalendar._id,
              status,
              publishedAt: status === "published" ? new Date() : null,
            },
          ],
          { session: transaction },
        );
        createdId = String(event._id);
        currentCalendar.publicEventId = event._id;
        await currentCalendar.save({ session: transaction });
        return {
          result: undefined,
          audit: {
            actor: auditActor(user),
            category: "events" as const,
            action:
              status === "published"
                ? ("publish" as const)
                : ("create" as const),
            operation: "events.publication.create",
            target: { type: "public-event", id: createdId, label: event.title },
            after: summarizePublicContent(
              event.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
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
    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await Event.findById(id).session(transaction);
        if (!current)
          throw new Error("Public event disappeared during update.");
        const before = current.toObject();
        current.set({ ...parsed.data, slug: event.slug });
        await current.save({ session: transaction });
        return {
          result: current,
          audit: {
            actor: auditActor(user),
            category: "events" as const,
            action: "update" as const,
            operation: "events.update",
            target: { type: "public-event", id, label: current.title },
            before: summarizePublicContent(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizePublicContent(
              current.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    await refresh(saved.slug, String(calendar._id));
    return ok({ event: publicEventDto(saved.toObject()) });
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
    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await Event.findById(id).session(transaction);
        if (!current)
          throw new Error("Public event disappeared during status update.");
        const before = current.toObject();
        current.status = status;
        if (status === "published" && !current.publishedAt)
          current.publishedAt = new Date();
        await current.save({ session: transaction });
        return {
          result: current,
          audit: {
            actor: auditActor(user),
            category: "events" as const,
            action:
              status === "published"
                ? ("publish" as const)
                : ("status_change" as const),
            operation: "events.status.update",
            target: { type: "public-event", id, label: current.title },
            before: summarizePublicContent(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizePublicContent(
              current.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    await refresh(saved.slug, String(calendar._id));
    return ok(publicEventDto(saved.toObject()));
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
    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const currentEvent = await Event.findById(id).session(transaction);
        const currentCalendar = await CalendarEvent.findById(
          event.calendarEventId,
        ).session(transaction);
        if (!currentEvent || !currentCalendar)
          throw new Error("Event linkage disappeared during schedule sync.");
        const before = currentEvent.toObject();
        currentEvent.set(scheduleValues(currentCalendar));
        await currentEvent.save({ session: transaction });
        return {
          result: currentEvent,
          audit: {
            actor: auditActor(user),
            category: "events" as const,
            action: "sync" as const,
            operation: "events.schedule.sync",
            target: { type: "public-event", id, label: currentEvent.title },
            before: summarizePublicContent(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizePublicContent(
              currentEvent.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    await refresh(saved.slug, String(calendar._id));
    return ok(publicEventDto(saved.toObject()));
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
