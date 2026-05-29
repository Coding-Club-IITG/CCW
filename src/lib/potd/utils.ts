/**
 * Pure utility helpers for POTD window calculations, scoring, and date formatting
 */

import { IST_OFFSET_MS } from "@/lib/constants";

/**
 * Given IST date string, compute the three window timestamps
 * Window: 12:00 AM IST (18:30 UTC prev day) -> 11:59 PM IST (18:29 UTC same day)
 * Grace:  11:59 PM IST -> 2:00 AM IST next day (20:29:59 UTC same day)
 */
export function computeWindowTimes(dateStr: string): {
  windowStart: Date;
  windowEnd: Date;
  graceEnd: Date;
} {
  const [year, month, day] = dateStr.split("-").map(Number);
  // windowStart: 12:00 AM IST = 18:30:00 UTC on the *previous* calendar day
  const windowStart = new Date(
    Date.UTC(year, month - 1, day - 1, 18, 30, 0, 0),
  );
  // windowEnd: 11:59:59 PM IST on the challenge date
  const windowEnd = new Date(Date.UTC(year, month - 1, day, 18, 29, 59, 999));
  // graceEnd: 2:00 AM IST next day (2h grace)
  const graceEnd = new Date(Date.UTC(year, month - 1, day, 20, 29, 59, 999));
  return { windowStart, windowEnd, graceEnd };
}

/**
 * Returns the current IST date string (YYYY-MM-DD)
 */
export function getTodayISTDateStr(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Converts a `windowStart` timestamp (18:30 UTC of the *previous* calendar day)
 * to the corresponding IST date string
 * windowStart is exactly 00:00 IST on the challenge date (18:30 UTC on day-1
 * = 00:00 IST on day). Adding IST_OFFSET_MS (5h30m) shifts it to 00:00 UTC
 * of the challenge date, so slicing the ISO string gives the correct IST date.
 */
export function windowStartToISTDateStr(windowStart: Date | string): string {
  const ms = new Date(windowStart).getTime() + IST_OFFSET_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Returns today + the next 10 days as IST date strings
 */
export function getAvailableDates(): string[] {
  const dates: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const istDate = new Date(Date.now() + IST_OFFSET_MS);
    istDate.setUTCDate(istDate.getUTCDate() + i);
    dates.push(istDate.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Formats a YYYY-MM-DD date string into a human-readable label
 */
export function formatDate(
  dateStr: string,
  weekday?: "short" | "long",
): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: weekday ?? undefined,
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Scoring formula:
 *   Normal solve (solvedAt ≤ windowEnd):
 *     Points = round((rating / 10) × (1 + 0.05 × min(streak, 10)))
 *     Streak increments.
 *   Grace solve (windowEnd < solvedAt ≤ graceEnd):
 *     Points = round((rating / 10) × 0.5)  <- 50% penalty, no streak bonus
 *     Streak is preserved but does NOT increment.
 *   After grace / not solved: 0 points, streak resets.
 */
export function computePoints(
  rating: number,
  solvedAtMs: number,
  windowEndMs: number,
  graceEndMs: number,
  currentStreak: number,
): number {
  const base = rating / 10;

  if (solvedAtMs <= windowEndMs) {
    // Normal window solve
    const streakBonus = 1.0 + 0.05 * Math.min(currentStreak, 10);
    return Math.max(0, Math.round(base * streakBonus));
  }

  if (solvedAtMs <= graceEndMs) {
    // Grace window solve
    return Math.max(0, Math.round(base * 0.5));
  }

  return 0;
}
