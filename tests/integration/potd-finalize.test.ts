import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  buildTimeline,
  markPastDaysFinalized,
  recomputeUser,
  syncUserChallenge,
} from "@/lib/potd/finalize";
import { computeWindowTimes } from "@/lib/potd/utils";
import CPUser from "@/models/CPUser";
import DailyChallenge from "@/models/POTDDailyChallenge";
import POTDOutage from "@/models/POTDOutage";
import Problem from "@/models/POTDProblem";
import POTDSubmission from "@/models/POTDSubmission";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

describe("POTD persisted scoring", () => {
  beforeAll(async () => {
    await startTestMongo();
  });

  afterEach(async () => {
    await clearTestMongo();
  });

  afterAll(async () => {
    await stopTestMongo();
  });

  it("builds a chronological timeline and preserves streaks on outage dates", async () => {
    const setBy = new mongoose.Types.ObjectId();
    const first = await createChallenge("2026-07-28", "Easy", 800, setBy);
    const second = await createChallenge("2026-07-29", "Hard", 1400, setBy);
    await createChallenge("2026-08-02", "Medium", 1000, setBy);
    await POTDOutage.create({ date: "2026-07-29", reason: "Platform outage" });

    const timeline = await buildTimeline(new Date("2026-07-30T00:00:00.000Z"));

    expect(timeline.days).toHaveLength(2);
    expect(
      timeline.days.flatMap((day) =>
        day.challenges.map((challenge) => challenge.challengeId),
      ),
    ).toEqual([first._id.toString(), second._id.toString()]);
    expect(timeline.days[0].challenges[0]).toMatchObject({
      rating: 800,
      streakPreserved: false,
    });
    expect(timeline.days[1].challenges[0]).toMatchObject({
      rating: 1400,
      streakPreserved: true,
    });
  });

  it("recomputes submission state and aggregate stats idempotently", async () => {
    const userId = new mongoose.Types.ObjectId();
    const setBy = new mongoose.Types.ObjectId();
    const first = await createChallenge("2026-07-28", "Easy", 1000, setBy);
    const second = await createChallenge("2026-07-29", "Easy", 1000, setBy);
    await CPUser.create({ userId });
    await POTDSubmission.create([
      {
        userId,
        challengeId: first._id,
        solvedAt: new Date("2026-07-28T10:00:00.000Z"),
      },
      {
        userId,
        challengeId: second._id,
        solvedAt: new Date("2026-07-29T19:00:00.000Z"),
      },
    ]);
    const now = new Date("2026-07-30T21:00:00.000Z");
    const { days } = await buildTimeline(now);

    await recomputeUser(userId, days, now);
    await recomputeUser(userId, days, now);

    const submissions = await POTDSubmission.find({ userId }).sort({
      challengeId: 1,
    });
    const cpUser = await CPUser.findOne({ userId }).lean();
    expect(submissions.map((submission) => submission.status).sort()).toEqual([
      "Accepted",
      "Late",
    ]);
    expect(
      submissions
        .map((submission) => submission.pointsAwarded)
        .sort((a, b) => a - b),
    ).toEqual([50, 100]);
    expect(cpUser).toMatchObject({
      potdTotalPoints: 150,
      potdTotalSolved: 2,
      potdCurrentStreak: 1,
      potdLongestStreak: 1,
    });
    expect(await POTDSubmission.countDocuments({ userId })).toBe(2);
  });

  it("marks only ended, unfinalized challenges as finalized", async () => {
    const setBy = new mongoose.Types.ObjectId();
    const ended = await createChallenge("2026-07-28", "Easy", 800, setBy);
    const alreadyFinalized = await createChallenge(
      "2026-07-28",
      "Hard",
      1400,
      setBy,
      new Date("2026-07-29T00:00:00.000Z"),
    );
    const future = await createChallenge("2026-08-02", "Easy", 800, setBy);
    const now = new Date("2026-07-30T00:00:00.000Z");

    expect(await markPastDaysFinalized(now)).toBe(1);

    expect((await DailyChallenge.findById(ended._id))?.finalizedAt).toEqual(
      now,
    );
    expect(
      (await DailyChallenge.findById(alreadyFinalized._id))?.finalizedAt,
    ).toEqual(new Date("2026-07-29T00:00:00.000Z"));
    expect((await DailyChallenge.findById(future._id))?.finalizedAt).toBeNull();
  });

  it("records the earliest platform solve and recomputes the user", async () => {
    const userId = new mongoose.Types.ObjectId();
    const setBy = new mongoose.Types.ObjectId();
    await CPUser.create({ userId });
    const challenge = await createChallenge("2026-07-29", "Easy", 1000, setBy);
    await challenge.populate("problem");
    const problem = challenge.problem as unknown as {
      contestId: string;
      problemIndex: string;
    };
    const now = new Date("2026-07-29T12:00:00.000Z");

    const result = await syncUserChallenge(
      userId.toString(),
      challenge,
      [
        {
          verdict: "OK",
          problem: {
            contestId: problem.contestId,
            index: problem.problemIndex,
          },
          creationTimeSeconds:
            new Date("2026-07-29T10:00:00.000Z").getTime() / 1000,
        },
      ],
      "codeforces",
      now,
    );

    const submission = await POTDSubmission.findOne({
      userId,
      challengeId: challenge._id,
    }).lean();
    expect(result).toEqual({ status: "Accepted", pointsAwarded: 100 });
    expect(submission?.solvedAt).toEqual(new Date("2026-07-29T10:00:00.000Z"));
  });
});

async function createChallenge(
  date: string,
  difficulty: "Easy" | "Medium" | "Hard",
  rating: number,
  setBy: mongoose.Types.ObjectId,
  finalizedAt: Date | null = null,
) {
  const problem = await Problem.create({
    platform: "codeforces",
    contestId: `${date}-${rating}`,
    problemIndex: difficulty.slice(0, 1),
    name: `${difficulty} fixture`,
    rating,
  });
  const windows = computeWindowTimes(date);
  return DailyChallenge.create({
    ...windows,
    problem: problem._id,
    difficulty,
    setBy,
    finalizedAt,
  });
}
