/**
 * POTD recompute / backfill
 */

import POTDSubmission from "@/models/POTDSubmission";
import CPUser from "@/models/CPUser";
import DailyChallenge from "@/models/POTDDailyChallenge";
import Problem from "@/models/POTDProblem";
import {
  processSubmission,
  findEarliestAcceptedSolveTime,
  buildMockSubmissions,
} from "@/lib/potd/submit";
import { getUserSubmissionsSince } from "@/lib/platforms/codeforces";
import { getUserSubmissions as getAtcoderSubmissions } from "@/lib/platforms/atcoder";
import type { Platform } from "@/lib/constants";

void Problem;

/**
 * Redis key marking that the end-of-day streak reset has already run for the
 * day starting at 'windowStartMs'
 */
export const STREAK_RESET_GUARD_PREFIX = "potd:streak_reset";
export const streakResetGuardKey = (windowStartMs: number): string =>
  `${STREAK_RESET_GUARD_PREFIX}:${windowStartMs}`;

/**
 * Fetch a user's submissions from the relevant platform, from 'windowStartMs' onward
 */
export async function fetchUserSubmissions(
  handle: string,
  platform: Platform,
  windowStartMs: number,
): Promise<any[]> {
  if (platform === "codeforces") {
    return getUserSubmissionsSince(handle, windowStartMs);
  }
  return getAtcoderSubmissions(handle, Math.floor(windowStartMs / 1000));
}

/**
 * All challenges whose grace window has ended sorted chronologically
 */
export async function getFinalizedChallenges(now: Date = new Date()) {
  return DailyChallenge.find({ graceEnd: { $lte: now } })
    .sort({ windowStart: 1, difficulty: 1 })
    .populate("problem");
}

/**
 * Group challenges by their day
 */
export function groupChallengesByDay(challenges: any[]): {
  daysMap: Map<number, any[]>;
  sortedDays: number[];
} {
  const daysMap = new Map<number, any[]>();
  for (const c of challenges) {
    const key = (c.windowStart as Date).getTime();
    if (!daysMap.has(key)) daysMap.set(key, []);
    daysMap.get(key)!.push(c);
  }
  const sortedDays = Array.from(daysMap.keys()).sort((a, b) => a - b);
  return { daysMap, sortedDays };
}

export const platformOf = (challenge: any): Platform =>
  ((challenge.problem as any)?.platform || "codeforces") as Platform;

/**
 * Set the 'solvedAt' on a user's POTDSubmission for each given challenge
 */
export async function backfillSolvedAt(
  userId: any,
  challenges: any[],
  submissions: any[],
  platform: Platform,
): Promise<number> {
  let solved = 0;
  for (const c of challenges) {
    const solvedAt = findEarliestAcceptedSolveTime(
      submissions,
      c.problem as any,
      c.windowStart as Date,
      c.graceEnd as Date,
      platform,
    );
    if (solvedAt) solved++;
    await POTDSubmission.updateOne(
      { userId, challengeId: c._id },
      {
        $set: { solvedAt },
        $setOnInsert: {
          status: "Pending",
          pointsAwarded: 0,
          solvedInGrace: false,
        },
      },
      { upsert: true },
    );
  }
  return solved;
}

const ZERO_STATS = {
  potdTotalPoints: 0,
  potdTotalSolved: 0,
  potdCurrentStreak: 0,
  potdLongestStreak: 0,
};

/** Reset POTD aggregate stats to zero for a single user */
export async function resetUserStats(userId: any): Promise<void> {
  await CPUser.updateOne({ userId }, { $set: { ...ZERO_STATS } });
}

/** Reset POTD aggregate stats to zero for all users */
export async function resetAllStats(): Promise<void> {
  await CPUser.updateMany({}, { $set: { ...ZERO_STATS } });
}

/**
 * Reconcile additive POTD totals for every user against the sum of their finalized submissions
 */
export async function reconcileAllStats(): Promise<number> {
  const agg = await POTDSubmission.aggregate([
    { $match: { status: { $in: ["Accepted", "Late"] } } },
    {
      $group: {
        _id: "$userId",
        pts: { $sum: "$pointsAwarded" },
        solved: { $sum: 1 },
      },
    },
  ]);
  const truth = new Map<string, { pts: number; solved: number }>();
  for (const a of agg as any[])
    truth.set(a._id.toString(), { pts: a.pts, solved: a.solved });

  const cpUsers = await CPUser.find(
    {},
    "userId potdTotalPoints potdTotalSolved",
  );
  let fixed = 0;
  for (const cp of cpUsers as any[]) {
    const want = truth.get(cp.userId.toString()) ?? { pts: 0, solved: 0 };
    if (cp.potdTotalPoints !== want.pts || cp.potdTotalSolved !== want.solved) {
      await CPUser.updateOne(
        { userId: cp.userId },
        {
          $set: {
            potdTotalPoints: want.pts,
            potdTotalSolved: want.solved,
          },
        },
      );
      fixed++;
    }
  }
  return fixed;
}

/**
 * Reset POTDSubmission scoring state to a clean pre-evaluation slate while
 * KEEPING 'solvedAt' (source of truth)
 */
export async function resetSubmissionStatuses(
  filter: Record<string, any> = {},
): Promise<void> {
  await POTDSubmission.updateMany(filter, {
    $set: { status: "Pending", pointsAwarded: 0, solvedInGrace: false },
  });
}

/**
 * Replay one user's entire finalized history chronologically, recomputing
 * status/points/streaks from their stored 'solvedAt' values
 */
export async function replayUser(
  userId: any,
  daysMap: Map<number, any[]>,
  sortedDays: number[],
  now: Date = new Date(),
): Promise<void> {
  const userSubs = await POTDSubmission.find({ userId });
  const byChallenge = new Map<string, any>();
  for (const s of userSubs) byChallenge.set(s.challengeId.toString(), s);

  for (const day of sortedDays) {
    const dayChallenges = daysMap.get(day)!;
    let solvedAnyToday = false;

    for (const challenge of dayChallenges) {
      const platform = platformOf(challenge);
      const sub = byChallenge.get(challenge._id.toString());
      const mocks = buildMockSubmissions(
        challenge.problem as any,
        platform,
        sub?.solvedAt ?? null,
      );

      // Re-fetch so processSubmission sees the running (already-updated) streak
      const latest = await CPUser.findOne({ userId });
      const r = await processSubmission(
        userId.toString(),
        challenge,
        latest,
        mocks,
        platform,
        now,
      );
      if (r.status === "Accepted" || r.status === "Late") solvedAnyToday = true;
    }

    if (!solvedAnyToday) {
      const latest = await CPUser.findOne({ userId });
      if (latest && latest.potdCurrentStreak > 0) {
        await CPUser.updateOne({ userId }, { $set: { potdCurrentStreak: 0 } });
      }
    }
  }
}
