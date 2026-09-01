/**
 * Pure helpers for the public events archive
 */

import { APP_TIME_ZONE, type EventRecurrenceType } from "@/lib/constants";

export const EVENT_VIEWS = ["posters", "timeline"] as const;
export type EventView = (typeof EVENT_VIEWS)[number];

/** How many past events the archive reveals per step */
export const ARCHIVE_STEP = 12;

export type EventQuery = {
  view?: string;
  module?: string;
  show?: string;
};

export function eventView(value?: string): EventView {
  return EVENT_VIEWS.includes(value as EventView)
    ? (value as EventView)
    : "posters";
}

/** How many archived events to render */
export function archiveShown(value: string | undefined, total: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isSafeInteger(parsed) || parsed < ARCHIVE_STEP) {
    return Math.min(ARCHIVE_STEP, total);
  }
  const rounded = Math.ceil(parsed / ARCHIVE_STEP) * ARCHIVE_STEP;
  return Math.min(rounded, total);
}

/** Build an archive URL, carrying the other filters through */
export function eventsHref(
  query: EventQuery,
  overrides: EventQuery = {},
): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  const view = eventView(merged.view);
  const moduleName = merged.module?.trim();
  const show = Number.parseInt(merged.show ?? "", 10);

  if (moduleName) params.set("module", moduleName);
  if (view !== "posters") params.set("view", view);
  if (Number.isSafeInteger(show) && show > ARCHIVE_STEP) {
    params.set("show", String(show));
  }

  const queryString = params.toString();
  return queryString ? `/events?${queryString}` : "/events";
}

const IST = { timeZone: APP_TIME_ZONE } as const;

/** Day of the month in IST */
export function istDay(value: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", { ...IST, day: "numeric" }).format(
    new Date(value),
  );
}

/** Start time in IST. Empty for all-day events. */
export function istTime(value: Date | string, allDay: boolean): string {
  if (allDay) return "All day";
  return new Intl.DateTimeFormat("en-IN", {
    ...IST,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(new Date(value))
    .toLowerCase();
}

/** Long-form calendar date in IST, without time */
export function istLongDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    ...IST,
    dateStyle: "long",
  }).format(new Date(value));
}

/** Long-form event date in IST, with time */
export function istEventWhen(value: Date | string, allDay: boolean): string {
  return new Intl.DateTimeFormat("en-IN", {
    ...IST,
    dateStyle: "long",
    ...(allDay ? {} : { timeStyle: "short" as const }),
  }).format(new Date(value));
}

/** Month grouping key and label, Eg. "2026-09" / "Sep 2026" */
export function istMonthKey(value: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    ...IST,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

// Month abbreviations follow the platform ICU data
export function istMonthLabel(value: Date | string): string {
  return new Intl.DateTimeFormat("en-IN", {
    ...IST,
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

/** Group events into month buckets, preserving the order they arrive in */
export function groupByMonth<T extends { startDate: string }>(
  events: T[],
): Array<{ key: string; label: string; items: T[] }> {
  const buckets = new Map<string, { key: string; label: string; items: T[] }>();
  for (const event of events) {
    const key = istMonthKey(event.startDate);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label: istMonthLabel(event.startDate), items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(event);
  }
  return [...buckets.values()];
}

/** Recurrence summary, or null when the event happens once */
export function recurrenceLabel(
  recurrenceType?: EventRecurrenceType,
  recurrenceCount?: number,
): string | null {
  if (!recurrenceType || recurrenceType === "none") return null;
  const count = Math.max(1, recurrenceCount ?? 1);
  const cadence =
    recurrenceType === "biweekly"
      ? "Every 2 weeks"
      : recurrenceType.charAt(0).toUpperCase() + recurrenceType.slice(1);
  return `${cadence} · ${count} occurrence${count === 1 ? "" : "s"}`;
}
