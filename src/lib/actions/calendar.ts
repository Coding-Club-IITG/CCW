"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  canManageCalendarEvent,
  type CalendarScopeTarget,
} from "@/lib/calendarAccess";
import { expandCalendarOccurrences } from "@/lib/calendar";
import { parseCalendarEventInput } from "@/lib/calendarValidation";
import { invalidateCache } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { parseManagedModules } from "@/lib/roles";
import { errorToLogMetadata, logger } from "@/lib/utils";
import CalendarEvent from "@/models/CalendarEvent";
import CalendarReminderDelivery from "@/models/CalendarReminderDelivery";
import Event from "@/models/Event";

type SessionUser = {
  id: string;
  access?: string;
  managedModules?: unknown;
};

async function currentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ? (session.user as SessionUser) : null;
}

function targetOf(event: { scope: string; module?: string | null }) {
  return event.scope === "module"
    ? ({ scope: "module", module: event.module ?? "" } as const)
    : ({ scope: "general" } as const);
}

function canManage(user: SessionUser, target: CalendarScopeTarget) {
  return canManageCalendarEvent(
    user.access,
    parseManagedModules(user.managedModules),
    target,
  );
}

function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function refreshCalendarPaths(id?: string) {
  await Promise.all([
    invalidateCache("calendar"),
    invalidateCache("admin:events"),
    invalidateCache("events"),
  ]);
  revalidatePath("/internal/calendar");
  if (id) revalidatePath(`/internal/calendar/${id}`);
  revalidatePath("/admin/events");
  revalidatePath("/events");
}

export async function listCalendarEvents(rangeStart: string, rangeEnd: string) {
  try {
    if (!(await currentUser())) {
      return { success: false as const, error: "Unauthorized" };
    }
    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 400 * 24 * 60 * 60 * 1000
    ) {
      return { success: false as const, error: "Invalid calendar range." };
    }

    await dbConnect();
    const records = await CalendarEvent.find({ startAt: { $lt: end } })
      .sort({ startAt: 1 })
      .lean();
    const data = records
      .map((event) => ({
        ...serialize(event),
        occurrences: expandCalendarOccurrences(
          {
            startAt: event.startAt,
            endAt: event.endAt,
            recurrenceType: event.recurrenceType,
            recurrenceCount: event.recurrenceCount,
          },
          start,
          end,
        ),
      }))
      .filter((event) => event.occurrences.length > 0);
    return { success: true as const, data: serialize(data) };
  } catch (error) {
    logger.error("Calendar listing failed", {
      operation: "list_calendar_events",
      ...errorToLogMetadata(error),
    });
    return {
      success: false as const,
      error: "Failed to load calendar events.",
    };
  }
}

export async function getCalendarEvent(id: string) {
  try {
    if (!(await currentUser())) {
      return { success: false as const, error: "Unauthorized" };
    }
    if (!mongoose.isValidObjectId(id)) {
      return { success: false as const, error: "Event not found." };
    }
    await dbConnect();
    const event = await CalendarEvent.findById(id).lean();
    return event
      ? { success: true as const, data: serialize(event) }
      : { success: false as const, error: "Event not found." };
  } catch (error) {
    logger.error("Calendar event lookup failed", {
      operation: "get_calendar_event",
      calendarEventId: id,
      ...errorToLogMetadata(error),
    });
    return { success: false as const, error: "Failed to load calendar event." };
  }
}

export async function createCalendarEvent(raw: unknown) {
  try {
    const user = await currentUser();
    if (!user) return { success: false as const, error: "Unauthorized" };
    const parsed = parseCalendarEventInput(raw);
    if (!parsed.success) return parsed;
    if (!canManage(user, targetOf(parsed.data))) {
      return {
        success: false as const,
        error: "You cannot manage events in that scope.",
      };
    }

    await dbConnect();
    const event = await CalendarEvent.create({
      ...parsed.data,
      createdBy: user.id,
    });
    await refreshCalendarPaths(String(event._id));
    return { success: true as const, data: serialize(event.toObject()) };
  } catch (error) {
    logger.error("Calendar event creation failed", {
      operation: "create_calendar_event",
      ...errorToLogMetadata(error),
    });
    return {
      success: false as const,
      error: "Failed to create calendar event.",
    };
  }
}

export async function updateCalendarEvent(id: string, raw: unknown) {
  try {
    const user = await currentUser();
    if (!user) return { success: false as const, error: "Unauthorized" };
    if (!mongoose.isValidObjectId(id)) {
      return { success: false as const, error: "Event not found." };
    }
    const parsed = parseCalendarEventInput(raw);
    if (!parsed.success) return parsed;
    await dbConnect();
    const existing = await CalendarEvent.findById(id);
    if (!existing)
      return { success: false as const, error: "Event not found." };
    if (
      !canManage(user, targetOf(existing)) ||
      !canManage(user, targetOf(parsed.data))
    ) {
      return {
        success: false as const,
        error: "You cannot manage events in that scope.",
      };
    }
    existing.set(parsed.data);
    await existing.save();
    await refreshCalendarPaths(id);
    return { success: true as const, data: serialize(existing.toObject()) };
  } catch (error) {
    logger.error("Calendar event update failed", {
      operation: "update_calendar_event",
      calendarEventId: id,
      ...errorToLogMetadata(error),
    });
    return {
      success: false as const,
      error: "Failed to update calendar event.",
    };
  }
}

export async function deleteCalendarEvent(id: string) {
  try {
    const user = await currentUser();
    if (!user) return { success: false as const, error: "Unauthorized" };
    if (!mongoose.isValidObjectId(id)) {
      return { success: false as const, error: "Event not found." };
    }
    await dbConnect();
    const existing = await CalendarEvent.findById(id).lean();
    if (!existing)
      return { success: false as const, error: "Event not found." };
    if (!canManage(user, targetOf(existing))) {
      return {
        success: false as const,
        error: "You cannot manage events in that scope.",
      };
    }

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        await Event.deleteOne({ calendarEventId: id }, { session: dbSession });
        await CalendarReminderDelivery.deleteMany(
          { calendarEventId: id },
          { session: dbSession },
        );
        await CalendarEvent.deleteOne({ _id: id }, { session: dbSession });
      });
    } finally {
      await dbSession.endSession();
    }
    await refreshCalendarPaths(id);
    return { success: true as const };
  } catch (error) {
    logger.error("Calendar event deletion failed", {
      operation: "delete_calendar_event",
      calendarEventId: id,
      ...errorToLogMetadata(error),
    });
    return {
      success: false as const,
      error: "Failed to delete calendar event.",
    };
  }
}
