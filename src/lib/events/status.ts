/**
 * Shared event status computation used across public, detail, and admin pages.
 */

import {
  IST_OFFSET_MS,
  type EventRecurrenceType,
  type EventStatus,
} from "@/lib/constants";

export function computeEffectiveEndDate(
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

export function getEventStatus(
  startDate: Date | string,
  endDate?: Date | string,
  recurrenceType?: EventRecurrenceType,
  recurrenceCount?: number,
): EventStatus {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const start = new Date(new Date(startDate).getTime() + IST_OFFSET_MS);

  let end: Date;
  if (endDate) {
    end = new Date(new Date(endDate).getTime() + IST_OFFSET_MS);
  } else if (recurrenceType && recurrenceType !== "none") {
    const effectiveEnd = computeEffectiveEndDate(
      startDate,
      recurrenceType,
      recurrenceCount,
    );
    end = new Date(effectiveEnd.getTime() + IST_OFFSET_MS);
  } else {
    end = start;
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventStart = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const eventEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  if (todayStart < eventStart) return "Upcoming";
  if (todayStart > eventEnd) return "Completed";
  return "Ongoing";
}
