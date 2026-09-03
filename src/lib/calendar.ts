import { createHash } from "crypto";
import type {
  CalendarScope,
  EventRecurrenceType,
  ModuleName,
} from "@/lib/constants";

const IST_OFFSET_MINUTES = 330;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CalendarSchedule {
  title: string;
  scope: CalendarScope;
  module?: ModuleName;
  allDay: boolean;
  startAt: Date;
  endAt?: Date;
  recurrenceType: EventRecurrenceType;
  recurrenceCount: number;
}

export interface CalendarOccurrence {
  index: number;
  startAt: Date;
  endAt?: Date;
}

export function parseCalendarDateTime(
  date: string,
  time: string,
  allDay: boolean,
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!allDay && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;

  const iso = `${date}T${allDay ? "00:00" : time}:00.000+05:30`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const dateInIST = new Date(parsed.getTime() + IST_OFFSET_MINUTES * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return dateInIST === date ? parsed : null;
}

function addRecurrence(date: Date, type: EventRecurrenceType, index: number) {
  const result = new Date(date);
  if (type === "daily") result.setUTCDate(result.getUTCDate() + index);
  if (type === "weekly") result.setUTCDate(result.getUTCDate() + index * 7);
  if (type === "biweekly") result.setUTCDate(result.getUTCDate() + index * 14);
  if (type === "monthly") result.setUTCMonth(result.getUTCMonth() + index);
  return result;
}

export function expandCalendarOccurrences(
  schedule: Pick<
    CalendarSchedule,
    "startAt" | "endAt" | "recurrenceType" | "recurrenceCount"
  >,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarOccurrence[] {
  const count =
    schedule.recurrenceType === "none" ? 1 : schedule.recurrenceCount;
  const duration = schedule.endAt
    ? schedule.endAt.getTime() - schedule.startAt.getTime()
    : 0;
  const occurrences: CalendarOccurrence[] = [];

  for (let index = 0; index < count; index += 1) {
    const startAt = addRecurrence(
      schedule.startAt,
      schedule.recurrenceType,
      index,
    );
    const endAt = schedule.endAt
      ? new Date(startAt.getTime() + duration)
      : undefined;
    const effectiveEnd = endAt ?? startAt;
    if (effectiveEnd >= rangeStart && startAt < rangeEnd) {
      occurrences.push({ index, startAt, endAt });
    }
  }

  return occurrences;
}

export function getReminderAt(occurrenceStart: Date, allDay: boolean): Date {
  if (!allDay) return new Date(occurrenceStart.getTime() - DAY_MS);

  const precedingDayInIST = new Date(
    occurrenceStart.getTime() + IST_OFFSET_MINUTES * 60 * 1000 - DAY_MS,
  );
  precedingDayInIST.setUTCHours(9, 0, 0, 0);
  return new Date(precedingDayInIST.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
}

export function buildScheduleFingerprint(schedule: CalendarSchedule): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: schedule.title,
        scope: schedule.scope,
        module: schedule.module ?? null,
        allDay: schedule.allDay,
        startAt: schedule.startAt.toISOString(),
        endAt: schedule.endAt?.toISOString() ?? null,
        recurrenceType: schedule.recurrenceType,
        recurrenceCount: schedule.recurrenceCount,
      }),
    )
    .digest("hex");
}
