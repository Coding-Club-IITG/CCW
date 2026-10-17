import { PULSE_TIME_BASED_MIN_PERCENT, type PulseScoringMode } from "@/lib/pulse/constants";
import type { PulseSlide } from "@/lib/pulse/deckSchemas";

// Pure scoring for MCQ slides (no I/O, no clock): the caller passes the elapsed time.
// Scores are whole points, at most the question's `points` (itself capped at 100).
//
//   full        correct -> points
//   time_based  correct -> points * (50% + 50% * timeRemaining / timeLimit)
//               i.e. 100% at the start of the question, falling linearly to 50% at the deadline
//   wrong answers and polls -> 0

type McqContent = Extract<PulseSlide, { type: "mcq" }>["content"];

/** A choice is correct only when the selected set equals the correct set exactly. */
export function isCorrectAnswer(content: Pick<McqContent, "correctOptions" | "poll">, selected: readonly number[]): boolean {
  if (content.poll || content.correctOptions.length === 0) return false;
  const chosen = new Set(selected);
  return chosen.size === content.correctOptions.length && content.correctOptions.every((option) => chosen.has(option));
}

/**
 * `points * (limit + remaining) / (2 * limit)`, which is points * (50% + 50% * remaining / limit),
 * computed with one integer rounding. Elapsed time is clamped to [0, limit], so an answer
 * accepted at or after the deadline earns the 50% floor, never less.
 */
export function timeBasedScore(points: number, elapsedMs: number, limitMs: number): number {
  if (!(limitMs > 0)) return Math.round((points * PULSE_TIME_BASED_MIN_PERCENT) / 100);
  const elapsed = Math.min(Math.max(Number.isFinite(elapsedMs) ? elapsedMs : limitMs, 0), limitMs);
  const remaining = limitMs - elapsed;
  return Math.round((points * (limitMs + remaining)) / (2 * limitMs));
}

export function scoreMcqAnswer(input: {
  mode: PulseScoringMode;
  content: Pick<McqContent, "correctOptions" | "poll" | "points">;
  selected: readonly number[];
  /** Time since the question opened. Used by `time_based` only. */
  elapsedMs?: number;
  /** The question's time limit (per-question timer, or the overall timer when participant-paced). */
  limitMs?: number;
}): number {
  const { mode, content, selected } = input;
  if (!isCorrectAnswer(content, selected)) return 0;
  if (mode === "time_based") return timeBasedScore(content.points, input.elapsedMs ?? 0, input.limitMs ?? 0);
  return content.points;
}
