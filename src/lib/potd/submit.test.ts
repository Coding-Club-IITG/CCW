import { describe, expect, it } from "vitest";

import { findEarliestAcceptedSolveTime } from "@/lib/potd/submit";

const windowStart = new Date("2026-07-29T18:30:00.000Z");
const graceEnd = new Date("2026-07-30T20:29:59.999Z");

describe("findEarliestAcceptedSolveTime", () => {
  it("returns the earliest qualifying Codeforces acceptance", () => {
    const result = findEarliestAcceptedSolveTime(
      [
        cfSubmission("OK", 202, "A", "2026-07-30T10:00:00.000Z"),
        cfSubmission("OK", 202, "A", "2026-07-30T08:00:00.000Z"),
        cfSubmission("WRONG_ANSWER", 202, "A", "2026-07-30T07:00:00.000Z"),
      ],
      { contestId: "202", problemIndex: "A" },
      windowStart,
      graceEnd,
      "codeforces",
    );

    expect(result).toEqual(new Date("2026-07-30T08:00:00.000Z"));
  });

  it("excludes Codeforces submissions outside the problem and time window", () => {
    const result = findEarliestAcceptedSolveTime(
      [
        cfSubmission("OK", 203, "A", "2026-07-30T08:00:00.000Z"),
        cfSubmission("OK", 202, "B", "2026-07-30T08:00:00.000Z"),
        cfSubmission("OK", 202, "A", "2026-07-29T18:29:59.000Z"),
        cfSubmission("OK", 202, "A", "2026-07-30T20:30:00.000Z"),
      ],
      { contestId: "202", problemIndex: "A" },
      windowStart,
      graceEnd,
      "codeforces",
    );

    expect(result).toBeNull();
  });

  it("returns the earliest qualifying AtCoder acceptance", () => {
    const result = findEarliestAcceptedSolveTime(
      [
        acSubmission("AC", "abc123_a", "2026-07-30T09:00:00.000Z"),
        acSubmission("AC", "abc123_a", "2026-07-30T07:00:00.000Z"),
        acSubmission("WA", "abc123_a", "2026-07-30T06:00:00.000Z"),
      ],
      { problemIndex: "abc123_a" },
      windowStart,
      graceEnd,
      "atcoder",
    );

    expect(result).toEqual(new Date("2026-07-30T07:00:00.000Z"));
  });

  it("excludes AtCoder submissions outside the problem and time window", () => {
    const result = findEarliestAcceptedSolveTime(
      [
        acSubmission("AC", "abc123_b", "2026-07-30T07:00:00.000Z"),
        acSubmission("AC", "abc123_a", "2026-07-29T18:29:59.000Z"),
        acSubmission("AC", "abc123_a", "2026-07-30T20:30:00.000Z"),
      ],
      { problemIndex: "abc123_a" },
      windowStart,
      graceEnd,
      "atcoder",
    );

    expect(result).toBeNull();
  });
});

function cfSubmission(
  verdict: string,
  contestId: number,
  index: string,
  timestamp: string,
) {
  return {
    verdict,
    problem: { contestId, index },
    creationTimeSeconds: new Date(timestamp).getTime() / 1000,
  };
}

function acSubmission(result: string, problemId: string, timestamp: string) {
  return {
    result,
    problem_id: problemId,
    epoch_second: new Date(timestamp).getTime() / 1000,
  };
}
