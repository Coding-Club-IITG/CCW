/**
 * Pure, deterministic scoring/streak engine
 */

import { computePoints } from "@/lib/potd/utils";

/** Minimal challenge shape needed for scoring (one difficulty on one day) */
export interface DeriveChallenge {
  challengeId: string;
  windowStartMs: number;
  windowEndMs: number;
  graceEndMs: number;
  rating: number;
}

/** One scoring day: all challenges that share the same windowStart */
export interface DeriveDay {
  windowStartMs: number;
  challenges: DeriveChallenge[];
}

export type SubmissionStatus = "Pending" | "Accepted" | "Late" | "NotSolved";

export interface DerivedSubmission {
  challengeId: string;
  status: SubmissionStatus;
  pointsAwarded: number;
  solvedInGrace: boolean;
  streakAtSolve: number;
}

export interface DerivedUserState {
  /** Per-challenge derived scoring, keyed by challengeId */
  submissions: Map<string, DerivedSubmission>;
  totalPoints: number;
  totalSolved: number;
  /** Streak as of the latest FINALIZED day */
  currentStreak: number;
  longestStreak: number;
}

/**
 * Classify a single challenge solve from its 'solvedAt' and the day windows
 * Returns null when there is no qualifying solve.
 */
function classifySolve(
  solvedAtMs: number | null,
  windowEndMs: number,
  graceEndMs: number,
): "main" | "grace" | null {
  if (solvedAtMs == null) return null;
  if (solvedAtMs <= windowEndMs) return "main";
  if (solvedAtMs <= graceEndMs) return "grace";
  // Beyond grace never counts
  return null;
}

/**
 * Group a flat challenge list into chronological scoring days
 * Each distinct windowStart becomes one day. Days are returned earliest-first.
 */
export function buildDays(challenges: DeriveChallenge[]): DeriveDay[] {
  const byDay = new Map<number, DeriveChallenge[]>();
  for (const c of challenges) {
    let bucket = byDay.get(c.windowStartMs);
    if (!bucket) {
      bucket = [];
      byDay.set(c.windowStartMs, bucket);
    }
    bucket.push(c);
  }
  return Array.from(byDay.keys())
    .sort((a, b) => a - b)
    .map((windowStartMs) => ({
      windowStartMs,
      challenges: byDay.get(windowStartMs)!,
    }));
}

/**
 * Derive a user's full scoring state by walking the calendar chronologically
 *
 * @param days        chronological scoring days
 * @param solvedAtByChallenge  the user's ground-truth earliest solve time (ms)
 *                    per challengeId. missing/null entry = unsolved
 * @param nowMs       current time. days with graceEnd > nowMs are treated as
 *                    still LIVE (no NotSolved, no streak reset)
 */
export function deriveUserState(
  days: DeriveDay[],
  solvedAtByChallenge: Map<string, number | null>,
  nowMs: number,
): DerivedUserState {
  const submissions = new Map<string, DerivedSubmission>();
  let totalPoints = 0;
  let totalSolved = 0;
  let streak = 0;
  let longestStreak = 0;

  for (const day of days) {
    const streakEntering = streak;
    let solvedMain = false;
    let solvedGrace = false;

    for (const c of day.challenges) {
      const solvedAtMs = solvedAtByChallenge.get(c.challengeId) ?? null;
      const kind = classifySolve(solvedAtMs, c.windowEndMs, c.graceEndMs);
      const dayFinalized = nowMs > c.graceEndMs;

      let status: SubmissionStatus;
      let points = 0;
      let solvedInGrace = false;

      if (kind === "main") {
        status = "Accepted";
        solvedMain = true;
        points = computePoints(
          c.rating,
          solvedAtMs!,
          c.windowEndMs,
          c.graceEndMs,
          streakEntering,
        );
      } else if (kind === "grace") {
        status = "Late";
        solvedGrace = true;
        solvedInGrace = true;
        points = computePoints(
          c.rating,
          solvedAtMs!,
          c.windowEndMs,
          c.graceEndMs,
          streakEntering,
        );
      } else {
        // No qualifying solve: NotSolved once finalized, else still Pending
        status = dayFinalized ? "NotSolved" : "Pending";
      }

      if (status === "Accepted" || status === "Late") {
        totalPoints += points;
        totalSolved += 1;
      }

      submissions.set(c.challengeId, {
        challengeId: c.challengeId,
        status,
        pointsAwarded: points,
        solvedInGrace,
        streakAtSolve: streakEntering,
      });
    }

    // Apply the day-level streak transition
    const dayOver = day.challenges.every((c) => nowMs > c.graceEndMs);
    if (solvedMain) {
      streak = streakEntering + 1;
    } else if (solvedGrace) {
      streak = streakEntering; // preserved, no increment
    } else if (dayOver) {
      streak = 0; // finalized miss
    } // else: live day, unsolved -> leave streak untouched

    if (streak > longestStreak) longestStreak = streak;
  }

  return {
    submissions,
    totalPoints,
    totalSolved,
    currentStreak: streak,
    longestStreak,
  };
}
