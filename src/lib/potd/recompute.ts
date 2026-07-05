/**
 * POTD recompute / backfill
 */

import POTDSubmission from "@/models/POTDSubmission";
import CPUser from "@/models/CPUser";
import DailyChallenge from "@/models/POTDDailyChallenge";
import Problem from "@/models/POTDProblem";
import POTDOutage from "@/models/POTDOutage";
import User from "@/models/User";
import { findEarliestAcceptedSolveTime } from "@/lib/potd/submit";
import { getUserSubmissionsSince } from "@/lib/platforms/codeforces";
import { getUserSubmissions as getAtcoderSubmissions } from "@/lib/platforms/atcoder";
import { computeWindowTimes } from "@/lib/potd/utils";
import type { Platform } from "@/lib/constants";

void Problem;

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

const CF_DELAY_MS = 2_100;
const AC_DELAY_MS = 1_100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Core orchestration logic for registering an outage and freezing streaks for a day
 */
export async function registerStreakFreeze(
  dateStr: string,
  execute: boolean,
  reason = "",
): Promise<void> {
  const windowTimes = computeWindowTimes(dateStr);
  const fromWindowStart = windowTimes.windowStart.getTime();

  // Find daily challenges on that specific windowStart
  const challenges = (await DailyChallenge.find({
    windowStart: windowTimes.windowStart,
  }).populate("problem")) as any[];

  if (challenges.length === 0) {
    throw new Error(`No challenges found for date ${dateStr} (windowStart: ${windowTimes.windowStart.toISOString()}).`);
  }

  console.log(`Found ${challenges.length} challenge(s) on ${dateStr}.`);
  for (const c of challenges) {
    console.log(`  - [${c.difficulty}] ID: ${c._id} (Problem: ${c.problem?.name || "unnamed"})`);
  }

  // Split challenges by platform
  const cfChallenges = challenges.filter((c) => platformOf(c) === "codeforces");
  const acChallenges = challenges.filter((c) => platformOf(c) === "atcoder");

  // Build verified-user -> handle maps
  const cpUsers = (await CPUser.find(
    {},
    "userId cfVerified acVerified"
  ).lean()) as any[];
  const userDocs = (await User.find(
    {},
    "_id codeforcesId atcoderId"
  ).lean()) as any[];

  const cfHandle = new Map<string, string>();
  const acHandle = new Map<string, string>();
  for (const u of userDocs) {
    if (u.codeforcesId) cfHandle.set(u._id.toString(), u.codeforcesId);
    if (u.atcoderId) acHandle.set(u._id.toString(), u.atcoderId);
  }

  const cfTargets = cpUsers.filter(
    (c) => c.cfVerified && cfHandle.has(c.userId.toString())
  );
  const acTargets = cpUsers.filter(
    (c) => c.acVerified && acHandle.has(c.userId.toString())
  );

  console.log(
    `Verified targets for polling -> CF: ${cfTargets.length}, AC: ${acTargets.length}`
  );

  if (!execute) {
    console.log(
      "\nDry run complete. No database changes were made. Re-run with --execute to apply."
    );
    return;
  }

  // Mark the challenges as streak-preserved in the POTDOutage collection
  console.log(`\nRegistering outage for date ${dateStr} in POTDOutage collection...`);
  await POTDOutage.updateOne(
    { date: dateStr },
    { $set: { reason } },
    { upsert: true }
  );

  // Backfill solvedAt from platform data for that day
  const runPlatform = async (
    targets: any[],
    handleMap: Map<string, string>,
    chs: any[],
    platform: Platform,
    delayMs: number
  ) => {
    if (chs.length === 0) return;
    console.log(`\nBackfilling ${platform} submissions...`);
    for (let i = 0; i < targets.length; i++) {
      const userId = targets[i].userId;
      const handle = handleMap.get(userId.toString())!;
      let subs: any[] = [];
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          subs = await fetchUserSubmissions(handle, platform, fromWindowStart);
          ok = true;
        } catch (e: any) {
          console.log(
            `  [${platform} ${i + 1}/${targets.length}] ${handle} attempt ${attempt} failed: ${e?.message}`
          );
          if (attempt < 3) await sleep(3000);
        }
      }
      if (!ok) {
        console.log(
          `  [${platform} ${i + 1}/${targets.length}] ${handle} - skipped`
        );
        await sleep(delayMs);
        continue;
      }
      const solved = await backfillSolvedAt(userId, chs, subs, platform);
      if (solved > 0 || (i + 1) % 10 === 0) {
        console.log(
          `  [${platform} ${i + 1}/${targets.length}] ${handle}: ${solved} solves`
        );
      }
      await sleep(delayMs);
    }
  };

  await runPlatform(
    cfTargets,
    cfHandle,
    cfChallenges,
    "codeforces",
    CF_DELAY_MS
  );
  await runPlatform(acTargets, acHandle, acChallenges, "atcoder", AC_DELAY_MS);

  console.log("\nRecomputing all users scoring timeline & streaks...");
  
  // Break circular dependency by dynamic importing
  const { buildTimeline, recomputeUsers } = await import("./finalize");
  
  const now = new Date();
  const { days } = await buildTimeline(now);
  const allCp = (await CPUser.find({}, "userId").lean()) as any[];
  const userIds = allCp.map((c) => c.userId);
  
  for (let i = 0; i < userIds.length; i++) {
    await recomputeUsers([userIds[i]], days, now);
    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${userIds.length}`);
  }
}
