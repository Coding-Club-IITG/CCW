"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  canManageCalendarEvent,
  type CalendarScopeTarget,
} from "@/lib/access/calendar";
import { defineAction } from "@/lib/actions/defineAction";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeCalendar } from "@/lib/audit/summary";
import { err as appError, ok, toBsonSafe } from "@/lib/api/result";
import { parseCalendarEventInput } from "@/lib/api/schemas/calendar";
import { auth } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";
import { expandCalendarOccurrences } from "@/lib/calendar";
import dbConnect from "@/lib/mongodb";
import { parseManagedModules } from "@/lib/roles";
import { errorToLogMetadata, logger } from "@/lib/utils";
import CalendarEvent from "@/models/CalendarEvent";
import CalendarReminderDelivery from "@/models/CalendarReminderDelivery";
import Event from "@/models/Event";

export const listCalendarEvents = defineAction(
  "listCalendarEvents",
  listCalendarEventsAction,
);
export const getCalendarEvent = defineAction(
  "getCalendarEvent",
  getCalendarEventAction,
);
export const createCalendarEvent = defineAction(
  "createCalendarEvent",
  createCalendarEventAction,
);
export const updateCalendarEvent = defineAction(
  "updateCalendarEvent",
  updateCalendarEventAction,
);
export const deleteCalendarEvent = defineAction(
  "deleteCalendarEvent",
  deleteCalendarEventAction,
);

type SessionUser = {
  id: string;
  name?: string;
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
  return toBsonSafe(value) as T;
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
  revalidatePath("/sitemap.xml");
}

async function listCalendarEventsAction(rangeStart: string, rangeEnd: string) {
  try {
    if (!(await currentUser())) {
      return appError("UNAUTHENTICATED", "Unauthorized");
    }
    const start = new Date(rangeStart);
    const end = new Date(rangeEnd);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 400 * 24 * 60 * 60 * 1000
    ) {
      return appError("VALIDATION_ERROR", "Invalid calendar range.");
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
    return ok(serialize(data));
  } catch (error) {
    logger.error("Calendar listing failed", {
      operation: "list_calendar_events",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function getCalendarEventAction(id: string) {
  try {
    if (!(await currentUser())) {
      return appError("UNAUTHENTICATED", "Unauthorized");
    }
    if (!mongoose.isValidObjectId(id)) {
      return appError("NOT_FOUND", "Event not found.");
    }
    await dbConnect();
    const event = await CalendarEvent.findById(id).lean();
    return event
      ? ok(serialize(event))
      : appError("NOT_FOUND", "Event not found.");
  } catch (error) {
    logger.error("Calendar event lookup failed", {
      operation: "get_calendar_event",
      calendarEventId: id,
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function createCalendarEventAction(raw: unknown) {
  try {
    const user = await currentUser();
    if (!user) return appError("UNAUTHENTICATED", "Unauthorized");
    const parsed = parseCalendarEventInput(raw);
    if (!parsed.success) return appError("VALIDATION_ERROR", parsed.error);
    if (!canManage(user, targetOf(parsed.data))) {
      return appError(
        "VALIDATION_ERROR",
        "You cannot manage events in that scope.",
      );
    }

    await dbConnect();
    const dbSession = await mongoose.startSession();
    let event;
    try {
      event = await auditedTransaction(dbSession, async (transaction) => {
        const [created] = await CalendarEvent.create(
          [{ ...parsed.data, createdBy: user.id }],
          { session: transaction },
        );
        return {
          result: created,
          audit: {
            actor: auditActor(user),
            category: "calendar" as const,
            action: "create" as const,
            operation: "calendar.create",
            target: {
              type: "calendar-event",
              id: String(created._id),
              label: created.title,
            },
            after: summarizeCalendar(
              created.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    await refreshCalendarPaths(String(event._id));
    return ok(serialize(event.toObject()));
  } catch (error) {
    logger.error("Calendar event creation failed", {
      operation: "create_calendar_event",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function updateCalendarEventAction(id: string, raw: unknown) {
  try {
    const user = await currentUser();
    if (!user) return appError("UNAUTHENTICATED", "Unauthorized");
    if (!mongoose.isValidObjectId(id)) {
      return appError("NOT_FOUND", "Event not found.");
    }
    const parsed = parseCalendarEventInput(raw);
    if (!parsed.success) return appError("VALIDATION_ERROR", parsed.error);
    await dbConnect();
    const existing = await CalendarEvent.findById(id).lean();
    if (!existing) return appError("NOT_FOUND", "Event not found.");
    if (
      !canManage(user, targetOf(existing)) ||
      !canManage(user, targetOf(parsed.data))
    ) {
      return appError(
        "VALIDATION_ERROR",
        "You cannot manage events in that scope.",
      );
    }
    const dbSession = await mongoose.startSession();
    let updated;
    try {
      updated = await auditedTransaction(dbSession, async (transaction) => {
        const current = await CalendarEvent.findById(id)
          .session(transaction)
          .lean();
        if (!current)
          throw new Error("Calendar event disappeared during update.");
        const record = await CalendarEvent.findByIdAndUpdate(id, parsed.data, {
          returnDocument: "after",
          runValidators: true,
          session: transaction,
        });
        if (!record)
          throw new Error("Calendar event disappeared during update.");
        return {
          result: record,
          audit: {
            actor: auditActor(user),
            category: "calendar" as const,
            action: "update" as const,
            operation: "calendar.update",
            target: { type: "calendar-event", id, label: record.title },
            before: summarizeCalendar(
              current as unknown as Record<string, unknown>,
            ),
            after: summarizeCalendar(
              record.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    await refreshCalendarPaths(id);
    return ok(serialize(updated.toObject()));
  } catch (error) {
    logger.error("Calendar event update failed", {
      operation: "update_calendar_event",
      calendarEventId: id,
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function deleteCalendarEventAction(id: string) {
  try {
    const user = await currentUser();
    if (!user) return appError("UNAUTHENTICATED", "Unauthorized");
    if (!mongoose.isValidObjectId(id)) {
      return appError("NOT_FOUND", "Event not found.");
    }
    await dbConnect();
    const existing = await CalendarEvent.findById(id).lean();
    if (!existing) return appError("NOT_FOUND", "Event not found.");
    if (!canManage(user, targetOf(existing))) {
      return appError(
        "VALIDATION_ERROR",
        "You cannot manage events in that scope.",
      );
    }

    const dbSession = await mongoose.startSession();
    try {
      await auditedTransaction(dbSession, async (transaction) => {
        const current = await CalendarEvent.findById(id)
          .session(transaction)
          .lean();
        if (!current)
          throw new Error("Calendar event disappeared during deletion.");
        const publication = await Event.deleteOne(
          { calendarEventId: id },
          { session: transaction },
        );
        const reminders = await CalendarReminderDelivery.deleteMany(
          { calendarEventId: id },
          { session: transaction },
        );
        await CalendarEvent.deleteOne({ _id: id }, { session: transaction });
        return {
          result: undefined,
          audit: {
            actor: auditActor(user),
            category: "calendar" as const,
            action: "delete" as const,
            operation: "calendar.delete",
            target: { type: "calendar-event", id, label: current.title },
            before: summarizeCalendar({
              ...current,
              cascadeCount: publication.deletedCount + reminders.deletedCount,
            } as unknown as Record<string, unknown>),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    await refreshCalendarPaths(id);
    return ok({});
  } catch (error) {
    logger.error("Calendar event deletion failed", {
      operation: "delete_calendar_event",
      calendarEventId: id,
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}
