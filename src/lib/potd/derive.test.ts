import { describe, expect, it } from "vitest";

import { buildDays, deriveUserState } from "@/lib/potd/derive";
import { potdChallenge, potdDay } from "../../../tests/fixtures/potd";

describe("buildDays", () => {
  it("groups same-day difficulties and orders days chronologically", () => {
    const days = buildDays([
      potdChallenge({ challengeId: "later", windowStartMs: 200 }),
      potdChallenge({ challengeId: "easy", windowStartMs: 100 }),
      potdChallenge({ challengeId: "hard", windowStartMs: 100 }),
    ]);

    expect(days.map((day) => day.windowStartMs)).toEqual([100, 200]);
    expect(
      days[0].challenges.map((challenge) => challenge.challengeId),
    ).toEqual(["easy", "hard"]);
  });
});

describe("deriveUserState", () => {
  it("increments a streak once when multiple difficulties are solved in the main window", () => {
    const day = potdDay(0, [{ rating: 800 }, { rating: 1200 }]);
    const solves = new Map([
      [day.challenges[0].challengeId, 100],
      [day.challenges[1].challengeId, 200],
    ]);

    const state = deriveUserState(
      [day],
      solves,
      day.challenges[0].graceEndMs + 1,
    );

    expect(state.totalSolved).toBe(2);
    expect(state.totalPoints).toBe(200);
    expect(state.currentStreak).toBe(1);
  });

  it("uses the entering streak for points on the following day", () => {
    const first = potdDay(0);
    const second = potdDay(1);
    const solves = new Map([
      [first.challenges[0].challengeId, 100],
      [second.challenges[0].challengeId, second.windowStartMs + 100],
    ]);

    const state = deriveUserState(
      [first, second],
      solves,
      second.challenges[0].graceEndMs + 1,
    );

    expect(state.totalPoints).toBe(205);
    expect(state.currentStreak).toBe(2);
    expect(state.longestStreak).toBe(2);
  });

  it("preserves but does not increment a streak for a grace solve", () => {
    const first = potdDay(0);
    const second = potdDay(1);
    const solves = new Map([
      [first.challenges[0].challengeId, 100],
      [second.challenges[0].challengeId, second.challenges[0].windowEndMs + 1],
    ]);

    const state = deriveUserState(
      [first, second],
      solves,
      second.challenges[0].graceEndMs + 1,
    );
    const late = state.submissions.get(second.challenges[0].challengeId);

    expect(late).toMatchObject({
      status: "Late",
      pointsAwarded: 50,
      solvedInGrace: true,
      streakAtSolve: 1,
    });
    expect(state.currentStreak).toBe(1);
  });

  it("resets a streak after a finalized miss but retains the longest streak", () => {
    const first = potdDay(0);
    const second = potdDay(1);
    const state = deriveUserState(
      [first, second],
      new Map([[first.challenges[0].challengeId, 100]]),
      second.challenges[0].graceEndMs + 1,
    );

    expect(
      state.submissions.get(second.challenges[0].challengeId)?.status,
    ).toBe("NotSolved");
    expect(state.currentStreak).toBe(0);
    expect(state.longestStreak).toBe(1);
  });

  it("leaves an unsolved live day pending without resetting the streak", () => {
    const first = potdDay(0);
    const live = potdDay(1);
    const state = deriveUserState(
      [first, live],
      new Map([[first.challenges[0].challengeId, 100]]),
      live.challenges[0].windowEndMs,
    );

    expect(state.submissions.get(live.challenges[0].challengeId)?.status).toBe(
      "Pending",
    );
    expect(state.currentStreak).toBe(1);
  });

  it("preserves a streak across an outage-exempt finalized miss", () => {
    const first = potdDay(0);
    const outage = potdDay(1, [{ streakPreserved: true }]);
    const state = deriveUserState(
      [first, outage],
      new Map([[first.challenges[0].challengeId, 100]]),
      outage.challenges[0].graceEndMs + 1,
    );

    expect(state.currentStreak).toBe(1);
    expect(
      state.submissions.get(outage.challenges[0].challengeId)?.status,
    ).toBe("NotSolved");
  });

  it("does not count a solve recorded after the grace deadline", () => {
    const day = potdDay(0);
    const state = deriveUserState(
      [day],
      new Map([
        [day.challenges[0].challengeId, day.challenges[0].graceEndMs + 1],
      ]),
      day.challenges[0].graceEndMs + 1,
    );

    expect(state.totalSolved).toBe(0);
    expect(state.totalPoints).toBe(0);
    expect(state.submissions.get(day.challenges[0].challengeId)?.status).toBe(
      "NotSolved",
    );
  });
});
