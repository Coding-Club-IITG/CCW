import { describe, expect, it } from "vitest";

import {
  getCodeforcesProblemUrl,
  formatRemainingTime,
  formatRoomActivityTime,
  getDisplayTeamName,
  getContestRoomResultsPath,
} from "./roomPresentation";

describe("roomPresentation utilities", () => {
  describe("getCodeforcesProblemUrl", () => {
    it("keeps numeric suffixes in a Codeforces problem index", () => {
      expect(getCodeforcesProblemUrl("1678B1")).toBe(
        "https://codeforces.com/contest/1678/problem/B1",
      );
      expect(getCodeforcesProblemUrl("1234D")).toBe(
        "https://codeforces.com/contest/1234/problem/D",
      );
    });

    it("rejects malformed, empty, or undefined problem identifiers gracefully", () => {
      expect(getCodeforcesProblemUrl("1678")).toBeNull();
      expect(getCodeforcesProblemUrl("")).toBeNull();
      expect(getCodeforcesProblemUrl("   ")).toBeNull();
      expect(getCodeforcesProblemUrl(undefined)).toBeNull();
      expect(getCodeforcesProblemUrl(null as unknown as string)).toBeNull();
    });
  });

  describe("formatRemainingTime", () => {
    it("formats seconds into MM:SS correctly with zero and negative clamp", () => {
      expect(formatRemainingTime(0)).toBe("00:00");
      expect(formatRemainingTime(-10)).toBe("00:00");
      expect(formatRemainingTime(5)).toBe("00:05");
      expect(formatRemainingTime(65)).toBe("01:05");
      expect(formatRemainingTime(3600)).toBe("60:00");
    });
  });

  describe("formatRoomActivityTime", () => {
    it("formats relative elapsed time accurately across intervals", () => {
      const now = 1700000000000;
      expect(formatRoomActivityTime(now - 1000, now)).toBe("just now");
      expect(formatRoomActivityTime(now - 20000, now)).toBe("20s ago");
      expect(formatRoomActivityTime(now - 120000, now)).toBe("2m ago");
      expect(formatRoomActivityTime(now - 3600000, now)).toBe("1h ago");
      expect(formatRoomActivityTime(now - 86400000, now)).toBe("1d ago");
    });
  });

  describe("getDisplayTeamName", () => {
    it("resolves solo and team names appropriately", () => {
      expect(getDisplayTeamName(undefined)).toBe("Unknown");

      const team = {
        _id: "t1",
        name: "Code Warriors",
        score: 10,
        members: [{ id: "m1", name: "Alice", pizza_count: 3, handle: "alice", avatar: null }],
      };

      expect(getDisplayTeamName(team, "1v1")).toContain("Alice");
      expect(getDisplayTeamName(team, "team-tournament")).toBe("Code Warriors");
    });
  });

  describe("getContestRoomResultsPath", () => {
    it("appends query param for bracket or knockout results", () => {
      expect(getContestRoomResultsPath("r1")).toBe("/internal/contests/rooms/r1/result");
      expect(getContestRoomResultsPath("r1", "bracket")).toBe("/internal/contests/rooms/r1/result?from=bracket");
      expect(getContestRoomResultsPath("r1", "1v1", "knockout")).toBe("/internal/contests/rooms/r1/result?from=bracket");
    });
  });
});
