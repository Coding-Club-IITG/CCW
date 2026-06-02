"use server";

import { auth } from "@/lib/auth";
import {
  EVENT_RECURRENCE_TYPES,
  EVENT_STATUSES,
  IST_OFFSET_MS,
  PROJECT_MODULES,
  type EventRecurrenceType,
  type EventStatus,
} from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { isAdmin } from "@/lib/roles";
import { logger } from "@/lib/utils";
import Event from "@/models/Event";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getDateKey(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

function getTodayISTDateKey(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function computeEffectiveEndDate(
  startDate: Date | string,
  recurrenceType?: EventRecurrenceType,
  recurrenceCount?: number,
): Date {
  const start = new Date(startDate);
  const count = recurrenceCount ?? 1;

  switch (recurrenceType) {
    case "daily":
      start.setDate(start.getDate() + count - 1);
      break;
    case "weekly":
      start.setDate(start.getDate() + (count - 1) * 7);
      break;
    case "biweekly":
      start.setDate(start.getDate() + (count - 1) * 14);
      break;
    case "monthly":
      start.setMonth(start.getMonth() + count - 1);
      break;
    default:
      break;
  }

  return start;
}

function getEventStatus(
  startDate: Date | string,
  endDate?: Date | string | null,
  recurrenceType?: EventRecurrenceType,
  recurrenceCount?: number,
): EventStatus {
  const today = getTodayISTDateKey();
  const start = getDateKey(startDate);

  let end: string;
  if (endDate) {
    end = getDateKey(endDate);
  } else if (recurrenceType && recurrenceType !== "none") {
    end = getDateKey(
      computeEffectiveEndDate(startDate, recurrenceType, recurrenceCount),
    );
  } else {
    end = start;
  }

  if (today < start) {
    return EVENT_STATUSES[0];
  }

  if (today <= end) {
    return EVENT_STATUSES[1];
  }

  return EVENT_STATUSES[2];
}

async function checkAdmin() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || !isAdmin((session.user as any).role)) {
      logger.warn(
        `[Admin Events] Unauthorized access attempt by: ${session?.user?.email || "Unknown"}`,
      );
      return null;
    }

    return session;
  } catch (err) {
    logger.error("[Admin Events] checkAdmin error:", err);
    return null;
  }
}

export async function getEvents() {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    await dbConnect();
    const events = await Event.find({}).sort({ startDate: -1 }).lean();
    const serializedEvents = JSON.parse(JSON.stringify(events)).map(
      (event: any) => ({
        ...event,
        status: getEventStatus(
          event.startDate,
          event.endDate,
          event.recurrenceType,
          event.recurrenceCount,
        ),
      }),
    );

    return { success: true as const, events: serializedEvents };
  } catch (err) {
    logger.error("[Admin Events] getEvents error:", err);
    return { success: false as const, error: "Failed to fetch events." };
  }
}

export async function getEvent(id: string) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    await dbConnect();
    const event = await Event.findById(id).lean();
    if (!event) {
      return { success: false as const, error: "Event not found." };
    }

    return {
      success: true as const,
      event: JSON.parse(JSON.stringify(event)),
    };
  } catch (err) {
    logger.error("[Admin Events] getEvent error:", err);
    return { success: false as const, error: "Failed to fetch event." };
  }
}

export async function createEvent(formData: FormData) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    const title = getString(formData, "title");
    const shortDescription = getString(formData, "shortDescription");
    const description = getString(formData, "description");
    const poster = getString(formData, "poster");
    const startDateInput = getString(formData, "startDate");
    const endDateInput = getString(formData, "endDate");
    const module = getString(formData, "module");
    const tags = parseTags(getString(formData, "tags"));
    const recurrenceType = getString(formData, "recurrenceType") || "none";
    const recurrenceCountStr = getString(formData, "recurrenceCount");
    const recurrenceCount = recurrenceCountStr
      ? Math.max(1, Math.min(52, Number(recurrenceCountStr) || 1))
      : 1;

    if (!title || !description || !poster || !startDateInput) {
      return {
        success: false as const,
        error: "Title, description, poster, and start date are required.",
      };
    }

    if (title.length > 200) {
      return {
        success: false as const,
        error: "Title must be 200 characters or fewer.",
      };
    }

    if (shortDescription.length > 200) {
      return {
        success: false as const,
        error: "Short description must be 200 characters or fewer.",
      };
    }

    if (
      module &&
      !PROJECT_MODULES.includes(module as (typeof PROJECT_MODULES)[number])
    ) {
      return { success: false as const, error: "Invalid module selected." };
    }

    if (
      !EVENT_RECURRENCE_TYPES.includes(recurrenceType as EventRecurrenceType)
    ) {
      return { success: false as const, error: "Invalid recurrence type." };
    }

    const startDate = parseDateInput(startDateInput);
    if (!startDate) {
      return { success: false as const, error: "Invalid start date." };
    }

    let endDate: Date | undefined;
    if (endDateInput) {
      const parsedEndDate = parseDateInput(endDateInput);
      if (!parsedEndDate) {
        return { success: false as const, error: "Invalid end date." };
      }
      if (parsedEndDate < startDate) {
        return {
          success: false as const,
          error: "End date cannot be earlier than start date.",
        };
      }
      endDate = parsedEndDate;
    }

    await dbConnect();
    const event = await Event.create({
      title,
      shortDescription,
      description,
      poster,
      startDate,
      endDate,
      module: module || undefined,
      tags,
      recurrenceType,
      recurrenceCount,
    });

    logger.info("[Admin Events] Created event", {
      eventId: String(event._id),
      title,
      admin: session.user.email,
    });

    revalidatePath("/admin/events");

    return {
      success: true as const,
      event: JSON.parse(JSON.stringify(event)),
    };
  } catch (err) {
    logger.error("[Admin Events] createEvent error:", err);
    return { success: false as const, error: "Failed to create event." };
  }
}

export async function updateEvent(id: string, formData: FormData) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    const title = getString(formData, "title");
    const shortDescription = getString(formData, "shortDescription");
    const description = getString(formData, "description");
    const poster = getString(formData, "poster");
    const startDateInput = getString(formData, "startDate");
    const endDateInput = getString(formData, "endDate");
    const module = getString(formData, "module");
    const tags = parseTags(getString(formData, "tags"));
    const recurrenceType = getString(formData, "recurrenceType") || "none";
    const recurrenceCountStr = getString(formData, "recurrenceCount");
    const recurrenceCount = recurrenceCountStr
      ? Math.max(1, Math.min(52, Number(recurrenceCountStr) || 1))
      : 1;

    if (!title || !description || !poster || !startDateInput) {
      return {
        success: false as const,
        error: "Title, description, poster, and start date are required.",
      };
    }

    if (title.length > 200) {
      return {
        success: false as const,
        error: "Title must be 200 characters or fewer.",
      };
    }

    if (shortDescription.length > 200) {
      return {
        success: false as const,
        error: "Short description must be 200 characters or fewer.",
      };
    }

    if (
      module &&
      !PROJECT_MODULES.includes(module as (typeof PROJECT_MODULES)[number])
    ) {
      return { success: false as const, error: "Invalid module selected." };
    }

    if (
      !EVENT_RECURRENCE_TYPES.includes(recurrenceType as EventRecurrenceType)
    ) {
      return { success: false as const, error: "Invalid recurrence type." };
    }

    const startDate = parseDateInput(startDateInput);
    if (!startDate) {
      return { success: false as const, error: "Invalid start date." };
    }

    let endDate: Date | undefined;
    if (endDateInput) {
      const parsedEndDate = parseDateInput(endDateInput);
      if (!parsedEndDate) {
        return { success: false as const, error: "Invalid end date." };
      }
      if (parsedEndDate < startDate) {
        return {
          success: false as const,
          error: "End date cannot be earlier than start date.",
        };
      }
      endDate = parsedEndDate;
    }

    await dbConnect();
    const event = await Event.findByIdAndUpdate(
      id,
      {
        title,
        shortDescription,
        description,
        poster,
        startDate,
        endDate,
        module: module || undefined,
        tags,
        recurrenceType,
        recurrenceCount,
      },
      { new: true },
    ).lean();

    if (!event) {
      return { success: false as const, error: "Event not found." };
    }

    logger.info("[Admin Events] Updated event", {
      eventId: id,
      title,
      admin: session.user.email,
    });

    revalidatePath("/admin/events");
    revalidatePath(`/admin/events/${id}`);

    return {
      success: true as const,
      event: JSON.parse(JSON.stringify(event)),
    };
  } catch (err) {
    logger.error("[Admin Events] updateEvent error:", err);
    return { success: false as const, error: "Failed to update event." };
  }
}

export async function deleteEvent(id: string) {
  try {
    const session = await checkAdmin();
    if (!session) {
      return { success: false as const, error: "Unauthorized" };
    }

    await dbConnect();
    const event = await Event.findByIdAndDelete(id).lean();
    if (!event) {
      return { success: false as const, error: "Event not found." };
    }

    logger.info("[Admin Events] Deleted event", {
      eventId: id,
      admin: session.user.email,
    });

    revalidatePath("/admin/events");

    return { success: true as const };
  } catch (err) {
    logger.error("[Admin Events] deleteEvent error:", err);
    return { success: false as const, error: "Failed to delete event." };
  }
}
