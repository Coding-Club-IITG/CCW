import { describe, expect, it } from "vitest";

import {
  bracketCapacityError,
  bracketProblemRequirements,
  buildBracketTopology,
  seededBracketOrder,
} from "./bracketTopology";

it("places seeds in balanced halves and awards byes to the highest seeds", () => {
  expect(seededBracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  for (let count = 3; count <= 32; count++) {
    const topology = buildBracketTopology(count, "single_elimination");
    const byeSeeds = topology.matches
      .filter((match) => match.roundIndex === 0 && !match.playable)
      .flatMap((match) =>
        match.sources.flatMap((source) =>
          source.kind === "seed" && source.seed <= count ? [source.seed] : [],
        ),
      );
    expect(byeSeeds.sort((a, b) => a - b)).toEqual(
      Array.from({ length: topology.size - count }, (_, i) => i + 1),
    );
    expect(topology.matches.filter((match) => match.playable)).toHaveLength(
      count - 1,
    );
  }
});

describe.each([4, 5, 6, 7, 8, 9, 15, 16, 31, 32, 64, 128, 256])(
  "double elimination for %i entrants",
  (count) => {
    it("routes every loss once and includes exactly one conditional reset", () => {
      const topology = buildBracketTopology(count, "double_elimination");
      expect(topology.matches.filter((match) => match.playable)).toHaveLength(
        2 * count - 1,
      );
      expect(
        topology.matches.filter((match) => match.conditional),
      ).toHaveLength(1);
      const results = new Map<
        string,
        { winner: number | null; loser: number | null }
      >();
      const losses = new Map<number, number>();
      for (const match of topology.matches) {
        const sides = match.sources.map((source) =>
          source.kind === "seed"
            ? source.seed <= count
              ? source.seed
              : null
            : results.get(source.position)![source.kind],
        );
        // Lower finalist wins the first final; every played match has a real loser.
        const winner =
          match.stage === "grand_final"
            ? sides[1]
            : (sides.find((side) => side !== null) ?? null);
        const loser =
          sides.find((side) => side !== null && side !== winner) ?? null;
        if (loser !== null) losses.set(loser, (losses.get(loser) ?? 0) + 1);
        if (winner !== null) expect(losses.get(winner) ?? 0).toBeLessThan(2);
        results.set(match.position, { winner, loser });
      }
      const champion = results.get("grand_final_reset-0-0")!.winner;
      for (let seed = 1; seed <= count; seed++)
        expect(losses.get(seed) ?? 0).toBe(seed === champion ? 1 : 2);
      expect(
        bracketProblemRequirements(count, "double_elimination", 3).reduce(
          (sum, round) => sum + round.problemCount,
          0,
        ),
      ).toBe((2 * count - 1) * 3);
    });
  },
);

it("rejects unsupported minima and requires explicit capacity without changing person counts", () => {
  expect(() => buildBracketTopology(3, "double_elimination")).toThrow(/4/);
  expect(() => buildBracketTopology(1, "single_elimination")).toThrow(/2/);
  expect(
    bracketCapacityError({
      format: "bracket",
      teamSize: 3,
      registrationSettings: { maxParticipants: 24, entrantCapacity: 8 },
    }),
  ).toBeNull();
  expect(
    bracketCapacityError({
      format: "bracket",
      teamSize: 3,
      registrationSettings: { maxParticipants: 8, entrantCapacity: 8 },
    }),
  ).toMatch(/times team size/);
  expect(
    bracketCapacityError({
      format: "bracket",
      registrationSettings: { maxParticipants: 8 },
    }),
  ).toMatch(/entrants/);
});
