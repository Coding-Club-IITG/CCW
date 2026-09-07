import { APP_TIME_ZONE } from "@/lib/constants";

/**
 * Returns the display name with pizza emojis appended based on pizza_count
 */
export function getDisplayName(name: string, pizzaCount: number = 0): string {
  if (!pizzaCount || pizzaCount <= 0) return name;
  return `${name} ${"🍕".repeat(pizzaCount)}`;
}

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

/** Stored avatars may be protocol-relative */
export function normalizeAvatar(image?: string | null): string | null {
  if (!image) return null;
  return image.startsWith("//") ? `https:${image}` : image;
}

export { errorToLogMetadata, logger } from "@/lib/logger";
export type { LogMetadata } from "@/lib/logger";
