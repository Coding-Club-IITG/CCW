import { describe, expect, it } from "vitest";

import {
  getRoundName,
  nextPowerOf2,
  parseBracketPosition,
  snakeSeed,
} from "@/types/bracket";

describe("bracket helpers & double elimination structures", () => {
  describe("parseBracketPosition", () => {
    it("handles legacy two-part bracket position strings by defaulting to upper bracket", () => {
      const pos = parseBracketPosition("0-1");
      expect(pos).toEqual({
        stage: "upper",
        roundIndex: 0,
        matchIndex: 1,
      });
    });

    it("parses upper stage positions correctly", () => {
      const pos = parseBracketPosition("upper-2-3");
      expect(pos).toEqual({
        stage: "upper",
        roundIndex: 2,
        matchIndex: 3,
      });
    });

    it("parses lower stage positions correctly", () => {
      const pos = parseBracketPosition("lower-1-0");
      expect(pos).toEqual({
        stage: "lower",
        roundIndex: 1,
        matchIndex: 0,
      });
    });

    it("parses grand_final stage positions correctly", () => {
      const pos = parseBracketPosition("grand_final-0-0");
      expect(pos).toEqual({
        stage: "grand_final",
        roundIndex: 0,
        matchIndex: 0,
      });
    });
  });

  describe("getRoundName", () => {
    it("returns standard single elimination round names", () => {
      expect(getRoundName(4, 4)).toBe("Final");
      expect(getRoundName(3, 4)).toBe("Semi-Finals");
      expect(getRoundName(2, 4)).toBe("Quarter-Finals");
      expect(getRoundName(1, 4)).toBe("Round of 16");
    });

    it("returns lower bracket specific round names", () => {
      expect(getRoundName(4, 4, "lower")).toBe("Lower Final");
      expect(getRoundName(3, 4, "lower")).toBe("Lower Semi-Finals");
      expect(getRoundName(2, 4, "lower")).toBe("Lower Round 2");
      expect(getRoundName(1, 4, "lower")).toBe("Lower Round 1");
    });

    it("returns Grand Final name", () => {
      expect(getRoundName(1, 1, "grand_final")).toBe("Grand Final");
    });
  });

  describe("snakeSeed & nextPowerOf2", () => {
    it("computes next power of 2 correctly", () => {
      expect(nextPowerOf2(1)).toBe(2);
      expect(nextPowerOf2(2)).toBe(2);
      expect(nextPowerOf2(3)).toBe(4);
      expect(nextPowerOf2(4)).toBe(4);
      expect(nextPowerOf2(5)).toBe(8);
      expect(nextPowerOf2(15)).toBe(16);
    });

    it("seeds teams in snake order", () => {
      const teams = [
        { teamId: "t1", seed: 1 },
        { teamId: "t2", seed: 2 },
        { teamId: "t3", seed: 3 },
        { teamId: "t4", seed: 4 },
      ];
      const seeded = snakeSeed(teams);
      expect(seeded.map((t) => t.teamId)).toEqual(["t1", "t4", "t2", "t3"]);
    });
  });

  describe("double elimination round and match math", () => {
    it.each([
      [4, 2, 2, 5],
      [8, 3, 4, 8],
      [16, 4, 6, 11],
    ])(
      "for size %i calculates Upper=%i, Lower=%i, Total=%i rounds",
      (size, expectedUpper, expectedLower, expectedTotal) => {
        const totalUpper = Math.log2(size);
        const totalLower = 2 * (totalUpper - 1);
        const totalRounds = totalUpper + totalLower + 1;

        expect(totalUpper).toBe(expectedUpper);
        expect(totalLower).toBe(expectedLower);
        expect(totalRounds).toBe(expectedTotal);
      },
    );

    it("calculates lower bracket matches per round correctly for size 8", () => {
      const size = 8;
      const totalLowerRounds = 2 * (Math.log2(size) - 1); // 4
      const matchesPerLowerRound: number[] = [];

      let currentLowerMatches = size / 4; // 2
      for (let l = 0; l < totalLowerRounds; l++) {
        if (l > 0 && l % 2 === 0) {
          currentLowerMatches = currentLowerMatches / 2;
        }
        matchesPerLowerRound.push(currentLowerMatches);
      }

      // Expected for size 8: Round 1 (2), Round 2 (2), Round 3 (1), Round 4 (1)
      expect(matchesPerLowerRound).toEqual([2, 2, 1, 1]);
    });

    it("calculates lower bracket matches per round correctly for size 16", () => {
      const size = 16;
      const totalLowerRounds = 2 * (Math.log2(size) - 1); // 6
      const matchesPerLowerRound: number[] = [];

      let currentLowerMatches = size / 4; // 4
      for (let l = 0; l < totalLowerRounds; l++) {
        if (l > 0 && l % 2 === 0) {
          currentLowerMatches = currentLowerMatches / 2;
        }
        matchesPerLowerRound.push(currentLowerMatches);
      }

      // Expected for size 16: 4, 4, 2, 2, 1, 1
      expect(matchesPerLowerRound).toEqual([4, 4, 2, 2, 1, 1]);
    });
  });
});
