"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { buildScheduleFingerprint } from "@/lib/calendar";
import { canPublishCalendarEvent } from "@/lib/calendarAccess";
import {
  EVENT_PUBLICATION_STATUSES,
  type EventPublicationStatus,
  type ModuleName,
} from "@/lib/constants";
import { invalidateCache } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { isHead, parseManagedModules } from "@/lib/roles";
import { errorToLogMetadata, logger } from "@/lib/utils";
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
    return {
      success: false as const,
      error: "Title, description, and poster are required.",
    };
  }
  if (data.title.length > 200 || data.shortDescription.length > 200) {
    return {
      success: false as const,
      error: "Title and short description must be 200 characters or fewer.",
    };
  }
  if (data.description.length > 50_000) {
    return { success: false as const, error: "Description is too long." };
  }
  return { success: true as const, data };
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

async function refresh(eventId?: string, calendarId?: string) {
  await Promise.all([
    invalidateCache("events"),
    invalidateCache("admin:events"),
    invalidateCache("calendar"),
  ]);
  revalidatePath("/events");
  revalidatePath("/admin/events");
  revalidatePath("/internal/calendar");
  if (eventId) revalidatePath(`/events/${eventId}`);
  if (calendarId) revalidatePath(`/internal/calendar/${calendarId}`);
}

export async function getEvents() {
  try {
    if (!(await currentAdmin()))
      return { success: false as const, error: "Unauthorized" };
    await dbConnect();
    const events = await Event.find({}).sort({ updatedAt: -1 }).lean();
    return {
      success: true as const,
      events: JSON.parse(JSON.stringify(events)),
    };
  } catch (error) {
    logger.error("Public event administration listing failed", {
      operation: "list_public_events",
      ...errorToLogMetadata(error),
    });
    return { success: false as const, error: "Failed to fetch events." };
  }
}

export async function getEvent(id: string) {
  try {
    if (!(await currentAdmin()))
      return { success: false as const, error: "Unauthorized" };
    await dbConnect();
    const event = mongoose.isValidObjectId(id)
      ? await Event.findById(id).lean()
      : null;
    return event
      ? { success: true as const, event: JSON.parse(JSON.stringify(event)) }
      : { success: false as const, error: "Event not found." };
  } catch (error) {
    logger.error("Public event lookup failed", {
      operation: "get_public_event",
      eventId: id,
      ...errorToLogMetadata(error),
    });
    return { success: false as const, error: "Failed to fetch event." };
  }
}

export async function createEvent() {
  return {
    success: false as const,
    error: "Create a calendar event before adding a public version.",
  };
}

export async function createPublicEvent(
  calendarEventId: string,
  input: FormData | Record<string, unknown>,
  status: EventPublicationStatus = "draft",
) {
  try {
    const user = await currentAdmin();
    if (!user) return { success: false as const, error: "Unauthorized" };
    if (
      !mongoose.isValidObjectId(calendarEventId) ||
      !EVENT_PUBLICATION_STATUSES.includes(status)
    ) {
      return {
        success: false as const,
        error: "Invalid public event request.",
      };
    }
    const parsed = parsePublicInput(input);
    if (!parsed.success) return parsed;
    await dbConnect();
    const calendar = await CalendarEvent.findById(calendarEventId);
    if (!calendar)
      return { success: false as const, error: "Calendar event not found." };
    if (!mayPublish(user, calendar))
      return { success: false as const, error: "Forbidden" };
    if (calendar.publicEventId || (await Event.exists({ calendarEventId }))) {
      return {
        success: false as const,
        error: "This calendar event already has a public event.",
      };
    }

    const dbSession = await mongoose.startSession();
    let createdId = "";
    try {
      await dbSession.withTransaction(async () => {
        const [event] = await Event.create(
          [
            {
              ...parsed.data,
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
    await refresh(createdId, calendarEventId);
    return { success: true as const, data: JSON.parse(JSON.stringify(event)) };
  } catch (error) {
    logger.error("Public event creation failed", {
      operation: "create_public_event",
      calendarEventId,
      ...errorToLogMetadata(error),
    });
    return { success: false as const, error: "Failed to create public event." };
  }
}

export async function updateEvent(
  id: string,
  input: FormData | Record<string, unknown>,
) {
  try {
    const user = await currentAdmin();
    if (!user) return { success: false as const, error: "Unauthorized" };
    const parsed = parsePublicInput(input);
    if (!parsed.success) return parsed;
    await dbConnect();
    const event = mongoose.isValidObjectId(id)
      ? await Event.findById(id)
      : null;
    if (!event) return { success: false as const, error: "Event not found." };
    const calendar = await CalendarEvent.findById(event.calendarEventId);
    if (!calendar || !mayPublish(user, calendar))
      return { success: false as const, error: "Forbidden" };
    event.set(parsed.data);
    await event.save();
    await refresh(id, String(calendar._id));
    return {
      success: true as const,
      event: JSON.parse(JSON.stringify(event.toObject())),
    };
  } catch (error) {
    logger.error("Public event update failed", {
      operation: "update_public_event",
      eventId: id,
      ...errorToLogMetadata(error),
    });
    return { success: false as const, error: "Failed to update event." };
  }
}

export async function setPublicEventStatus(
  id: string,
  status: EventPublicationStatus,
) {
  try {
    const user = await currentAdmin();
    if (!user) return { success: false as const, error: "Unauthorized" };
    if (!EVENT_PUBLICATION_STATUSES.includes(status))
      return { success: false as const, error: "Invalid publication status." };
    await dbConnect();
    const event = mongoose.isValidObjectId(id)
      ? await Event.findById(id)
      : null;
    if (!event) return { success: false as const, error: "Event not found." };
    const calendar = await CalendarEvent.findById(event.calendarEventId);
    if (!calendar || !mayPublish(user, calendar))
      return { success: false as const, error: "Forbidden" };
    event.status = status;
    if (status === "published" && !event.publishedAt)
      event.publishedAt = new Date();
    await event.save();
    await refresh(id, String(calendar._id));
    return {
      success: true as const,
      data: JSON.parse(JSON.stringify(event.toObject())),
    };
  } catch (error) {
    logger.error("Public event status update failed", {
      operation: "set_public_event_status",
      eventId: id,
      ...errorToLogMetadata(error),
    });
    return {
      success: false as const,
      error: "Failed to update publication status.",
    };
  }
}

export async function syncPublicEventSchedule(id: string) {
  try {
    const user = await currentAdmin();
    if (!user) return { success: false as const, error: "Unauthorized" };
    await dbConnect();
    const event = mongoose.isValidObjectId(id)
      ? await Event.findById(id)
      : null;
    if (!event) return { success: false as const, error: "Event not found." };
    const calendar = await CalendarEvent.findById(event.calendarEventId);
    if (!calendar || !mayPublish(user, calendar))
      return { success: false as const, error: "Forbidden" };
    event.set(scheduleValues(calendar));
    await event.save();
    await refresh(id, String(calendar._id));
    return {
      success: true as const,
      data: JSON.parse(JSON.stringify(event.toObject())),
    };
  } catch (error) {
    logger.error("Public event schedule sync failed", {
      operation: "sync_public_event_schedule",
      eventId: id,
      ...errorToLogMetadata(error),
    });
    return {
      success: false as const,
      error: "Failed to synchronize event schedule.",
    };
  }
}

export async function deleteEvent() {
  return {
    success: false as const,
    error: "Delete the linked calendar event instead.",
  };
}
