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
