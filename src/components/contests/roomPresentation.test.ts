import { describe, expect, it } from "vitest";

import {
  formatRemainingTime,
  formatRoomActivityTime,
  getContestRoomResultsPath,
} from "@/components/contests/roomPresentation";

describe("contest room presentation", () => {
  it("formats a positive duration as minutes and seconds", () => {
    expect(formatRemainingTime(125)).toBe("02:05");
  });

  it("clamps expired durations to zero", () => {
    expect(formatRemainingTime(-1)).toBe("00:00");
  });

  it.each([
    [4_000, "just now"],
    [5_000, "5s ago"],
    [59_000, "59s ago"],
    [60_000, "1m ago"],
    [3_600_000, "1h ago"],
  ])("formats an activity age of %i milliseconds", (age, expected) => {
    expect(formatRoomActivityTime(10_000_000 - age, 10_000_000)).toBe(expected);
  });

  it("builds the unchanged bracket result route", () => {
    expect(getContestRoomResultsPath("room-1", "bracket", "arena")).toBe(
      "/internal/contests/rooms/room-1/result?from=bracket",
    );
  });

  it("builds the unchanged standard result route", () => {
    expect(getContestRoomResultsPath("room-1", "1v1", "arena")).toBe(
      "/internal/contests/rooms/room-1/result",
    );
  });
});
