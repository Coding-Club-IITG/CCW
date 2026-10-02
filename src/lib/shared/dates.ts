import { APP_TIME_ZONE } from "@/lib/constants";

/** Day, full month and year in IST, Eg. "17 August 2026" */
export function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(date));
}

/** Day, short month and year in IST, Eg. "17 Aug 2026" */
export function formatShortDate(date?: Date | string | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(date));
}

/** Date and time in IST, Eg. "17 Aug 2026, 9:30 pm" */
export function formatDateTime(date?: Date | string | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(date));
}

/** Day, short month and time in IST without a year, Eg. "17 Aug, 9:30 pm" */
export function formatDayTime(date?: Date | string | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(date));
}

/** Short month and year, Eg. "Aug 2024" */
export function formatMonthYear(date?: Date | string | null) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

/** ISO calendar date in IST for date inputs and day comparisons */
export function formatDateInput(date: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(date));
}

/** Datetime-local value in IST, independent of the browser timezone */
export function formatDateTimeInput(date: Date | string): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(date));
  return `${formatDateInput(date)}T${time}`;
}

/** Interpret a datetime-local field as an IST schedule */
export function parseDateTimeInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const parsed = new Date(`${value}:00.000+05:30`);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateInput(parsed) === value.slice(0, 10) ? parsed : null;
}
