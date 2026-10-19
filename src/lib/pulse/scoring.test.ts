import { describe, expect, it } from "vitest";

import { isCorrectAnswer, scoreMcqAnswer, timeBasedScore } from "@/lib/pulse/scoring";

const content = (over: object = {}) => ({ correctOptions: [1], poll: false, points: 100, ...over });

describe("isCorrectAnswer", () => {
  it("needs the exact set of correct options", () => {
    expect(isCorrectAnswer(content(), [1])).toBe(true);
    expect(isCorrectAnswer(content(), [0])).toBe(false);
    expect(isCorrectAnswer(content(), [0, 1])).toBe(false);
    expect(isCorrectAnswer(content(), [])).toBe(false);
    expect(isCorrectAnswer(content({ correctOptions: [0, 2] }), [2, 0])).toBe(true);
    expect(isCorrectAnswer(content({ correctOptions: [0, 2] }), [0])).toBe(false);
  });

  it("never marks a poll correct", () => {
    expect(isCorrectAnswer(content({ poll: true, correctOptions: [] }), [])).toBe(false);
  });
});

describe("timeBasedScore", () => {
  it("is 100% at the start, 75% halfway and 50% at the deadline", () => {
    expect(timeBasedScore(100, 0, 20_000)).toBe(100);
    expect(timeBasedScore(100, 10_000, 20_000)).toBe(75);
    expect(timeBasedScore(100, 20_000, 20_000)).toBe(50);
  });

  it("falls linearly in between", () => {
    expect(timeBasedScore(100, 5_000, 20_000)).toBe(88); // 87.5 rounds up
    expect(timeBasedScore(100, 15_000, 20_000)).toBe(63); // 62.5 rounds up
    expect(timeBasedScore(60, 10_000, 20_000)).toBe(45);
  });

  it("clamps elapsed time to the question window", () => {
    expect(timeBasedScore(100, -500, 20_000)).toBe(100);
    expect(timeBasedScore(100, 99_000, 20_000)).toBe(50);
    expect(timeBasedScore(100, Number.NaN, 20_000)).toBe(50);
  });

  it("falls back to the 50% floor without a valid time limit", () => {
    expect(timeBasedScore(100, 0, 0)).toBe(50);
    expect(timeBasedScore(100, 0, -1)).toBe(50);
  });

  it("never goes below half or above the question's points", () => {
    for (let elapsed = 0; elapsed <= 30_000; elapsed += 250) {
      const score = timeBasedScore(100, elapsed, 30_000);
      expect(score).toBeGreaterThanOrEqual(50);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe("scoreMcqAnswer", () => {
  it("full mode awards all the points to a correct answer regardless of time", () => {
    expect(scoreMcqAnswer({ mode: "full", content: content(), selected: [1], elapsedMs: 19_000, limitMs: 20_000 })).toBe(100);
    expect(scoreMcqAnswer({ mode: "full", content: content({ points: 40 }), selected: [1] })).toBe(40);
  });

  it("time-based mode scales a correct answer by the time used", () => {
    expect(scoreMcqAnswer({ mode: "time_based", content: content(), selected: [1], elapsedMs: 10_000, limitMs: 20_000 })).toBe(75);
  });

  it("awards nothing for a wrong answer or a poll in either mode", () => {
    for (const mode of ["full", "time_based"] as const) {
      expect(scoreMcqAnswer({ mode, content: content(), selected: [0], elapsedMs: 0, limitMs: 20_000 })).toBe(0);
      expect(scoreMcqAnswer({ mode, content: content({ poll: true, correctOptions: [] }), selected: [0], elapsedMs: 0, limitMs: 20_000 })).toBe(0);
    }
  });
});
