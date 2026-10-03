import { describe, expect, it } from "vitest";

import { decidePlayedOutcome } from "@/lib/contests/matchScoring";

import type { IRoomScore } from "@/models/ContestRoom";

const team = (
  teamId: string,
  fields: Partial<IRoomScore> = {},
): IRoomScore => ({
  teamId,
  score: 0,
  solveTimeMs: 0,
  wrongSubmissions: 0,
  penaltyTimeMs: 0,
  lastSolveAt: 0,
  ...fields,
});

describe("played match decisions", () => {
  it.each(["blitz", "arena"] as const)("uses score first in %s", (mode) => {
    expect(
      decidePlayedOutcome(
        [
          team("a", { score: 100, seed: 1 }),
          team("b", { score: 200, seed: 2 }),
        ],
        mode,
        true,
      ),
    ).toEqual({ winnerId: "b", method: "score" });
  });

  it.each(["blitz", "arena"] as const)(
    "draws equal non-bracket scores in %s",
    (mode) => {
      expect(
        decidePlayedOutcome(
          [
            team("a", { score: 200, seed: 1 }),
            team("b", {
              score: 200,
              seed: 2,
              solveTimeMs: 100,
              penaltyTimeMs: 100,
            }),
          ],
          mode,
          false,
        ),
      ).toEqual({ winnerId: null, method: "draw" });
    },
  );

  it.each([
    ["blitz", "solveTimeMs", "solve_time"],
    ["blitz", "wrongSubmissions", "wrong_submissions"],
    ["arena", "penaltyTimeMs", "penalty_time"],
    ["arena", "lastSolveAt", "last_solve"],
  ] as const)("breaks %s ties using %s before seed", (mode, key, method) => {
    expect(
      decidePlayedOutcome(
        [
          team("a", { score: 100, seed: 1, [key]: 10 }),
          team("b", { score: 100, seed: 2, [key]: 5 }),
        ],
        mode,
        true,
      ),
    ).toEqual({ winnerId: "b", method });
  });

  it.each(["blitz", "arena"] as const)(
    "uses frozen seed for played zero-score ties in %s",
    (mode) => {
      expect(
        decidePlayedOutcome(
          [team("a", { seed: 8 }), team("b", { seed: 1 })],
          mode,
          true,
        ),
      ).toEqual({ winnerId: "b", method: "seed" });
    },
  );
});
