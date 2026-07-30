import type { DeriveChallenge, DeriveDay } from "@/lib/potd/derive";

const HOUR = 60 * 60 * 1000;

export function potdChallenge(
  overrides: Partial<DeriveChallenge> = {},
): DeriveChallenge {
  return {
    challengeId: "challenge-1",
    windowStartMs: 0,
    windowEndMs: 24 * HOUR - 1,
    graceEndMs: 26 * HOUR - 1,
    rating: 1000,
    ...overrides,
  };
}

export function potdDay(
  dayNumber: number,
  challenges: Array<Partial<DeriveChallenge>> = [{}],
): DeriveDay {
  const windowStartMs = dayNumber * 24 * HOUR;
  return {
    windowStartMs,
    challenges: challenges.map((challenge, index) =>
      potdChallenge({
        challengeId: `day-${dayNumber}-challenge-${index + 1}`,
        windowStartMs,
        windowEndMs: windowStartMs + 24 * HOUR - 1,
        graceEndMs: windowStartMs + 26 * HOUR - 1,
        ...challenge,
      }),
    ),
  };
}
