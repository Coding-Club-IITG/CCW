/**
 * DB layer that turns solve facts into persisted scoring state
 */

import mongoose from "mongoose";
import CPUser from "@/models/CPUser";
import DailyChallenge from "@/models/POTDDailyChallenge";
import POTDSubmission from "@/models/POTDSubmission";
import { logger } from "@/lib/utils";
import { findEarliestAcceptedSolveTime } from "@/lib/potd/submit";
import { fetchUserSubmissions } from "@/lib/potd/recompute";
import {
  buildDays,
  deriveUserState,
  type DeriveChallenge,
  type DeriveDay,
} from "@/lib/potd/derive";
import { isAtCoderAPIReachable } from "@/lib/platforms/atcoder";
import { isCodeforcesAPIReachable } from "@/lib/platforms/codeforces";
import type { Platform } from "@/lib/constants";

const HEALTH_CHECK_RETRIES = 3;
const HEALTH_CHECK_DELAY_MS = 10_000;
const INTER_USER_DELAY_MS = 2_100; // CF ~1 req/s (under threshold)

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const platformOfChallenge = (challenge: any): Platform =>
  ((challenge.problem as any)?.platform || "codeforces") as Platform;

/**
 * Build the full chronological timeline of challenges that have STARTED
 * (windowStart <= now), including the currently-live day
 */
export async function buildTimeline(now: Date = new Date()): Promise<{
  days: DeriveDay[];
  challengeDocs: Map<string, any>;
}> {
  const challenges = await DailyChallenge.find({
    windowStart: { $lte: now },
  })
    .sort({ windowStart: 1, difficulty: 1 })
    .populate("problem");

  const deriveChallenges: DeriveChallenge[] = [];
  const challengeDocs = new Map<string, any>();
  for (const c of challenges as any[]) {
    const problem = c.problem as any;
    if (!problem) continue; // problem deleted, skip defensively
    const id = c._id.toString();
    challengeDocs.set(id, c);
    deriveChallenges.push({
      challengeId: id,
      windowStartMs: (c.windowStart as Date).getTime(),
      windowEndMs: (c.windowEnd as Date).getTime(),
      graceEndMs: (c.graceEnd as Date).getTime(),
      rating: problem.rating ?? 0,
      streakPreserved: c.streakPreserved ?? false,
    });
  }

  return { days: buildDays(deriveChallenges), challengeDocs };
}

/**
 * Recompute and persist one user's scoring state from their stored info
 */
export async function recomputeUser(
  userId: any,
  days: DeriveDay[],
  now: Date = new Date(),
): Promise<void> {
  const existing = await POTDSubmission.find({ userId });
  const solvedAtByChallenge = new Map<string, number | null>();
  const existingIds = new Set<string>();
  for (const s of existing as any[]) {
    const cid = s.challengeId.toString();
    existingIds.add(cid);
    solvedAtByChallenge.set(
      cid,
      s.solvedAt ? new Date(s.solvedAt).getTime() : null,
    );
  }

  const state = deriveUserState(days, solvedAtByChallenge, now.getTime());

  const ops: any[] = [];
  for (const [cid, d] of state.submissions) {
    const isSolve = d.status === "Accepted" || d.status === "Late";
    if (!existingIds.has(cid) && !isSolve) continue;
    ops.push({
      updateOne: {
        filter: { userId, challengeId: new mongoose.Types.ObjectId(cid) },
        update: {
          $set: {
            status: d.status,
            pointsAwarded: d.pointsAwarded,
            solvedInGrace: d.solvedInGrace,
            streakAtSolve: d.streakAtSolve,
            lastCheckedAt: now,
          },
          $setOnInsert: {
            userId,
            challengeId: new mongoose.Types.ObjectId(cid),
          },
        },
        upsert: true,
      },
    });
  }

  if (ops.length > 0) await POTDSubmission.bulkWrite(ops, { ordered: false });

  await CPUser.updateOne(
    { userId },
    {
      $set: {
        potdTotalPoints: state.totalPoints,
        potdTotalSolved: state.totalSolved,
        potdCurrentStreak: state.currentStreak,
        potdLongestStreak: state.longestStreak,
      },
    },
  );
}

/** Recompute many users sequentially against a shared timeline */
export async function recomputeUsers(
  userIds: any[],
  days: DeriveDay[],
  now: Date = new Date(),
): Promise<void> {
  for (const userId of userIds) {
    await recomputeUser(userId, days, now);
  }
}

/**
 * Mark every day whose grace window has ended but not yet finalized as finalized
 */
export async function markPastDaysFinalized(
  now: Date = new Date(),
): Promise<number> {
  const res = await DailyChallenge.updateMany(
    { graceEnd: { $lte: now }, finalizedAt: null },
    { $set: { finalizedAt: now } },
  );
  return res.modifiedCount ?? 0;
}

/**
 * Live single-user sync
 * Records the user's 'solvedAt' for one challenge,
 * then recomputes that user's full scoring state.
 */
export async function syncUserChallenge(
  userId: string,
  challenge: any,
  platformSubs: any[],
  platform: Platform,
  now: Date = new Date(),
): Promise<{ status: string; pointsAwarded: number }> {
  const problem = challenge.problem as any;

  const solvedAt = findEarliestAcceptedSolveTime(
    platformSubs,
    problem,
    challenge.windowStart as Date,
    challenge.graceEnd as Date,
    platform,
  );

  // Record the solve fact
  await POTDSubmission.updateOne(
    { userId, challengeId: challenge._id },
    {
      $set: { solvedAt, lastCheckedAt: now },
      $setOnInsert: { userId, challengeId: challenge._id, status: "Pending" },
    },
    { upsert: true },
  );

  const { days } = await buildTimeline(now);
  await recomputeUser(userId, days, now);

  const updated = await POTDSubmission.findOne({
    userId,
    challengeId: challenge._id,
  });
  return {
    status: updated?.status ?? "Pending",
    pointsAwarded: updated?.pointsAwarded ?? 0,
  };
}

/** Health-check platform API */
async function checkPlatformHealth(platform: Platform): Promise<boolean> {
  for (let attempt = 1; attempt <= HEALTH_CHECK_RETRIES; attempt++) {
    const reachable =
      platform === "codeforces"
        ? await isCodeforcesAPIReachable()
        : await isAtCoderAPIReachable();
    if (reachable) return true;
    logger.warn(
      `[potd-finalize] ${platform} API unreachable (attempt ${attempt}/${HEALTH_CHECK_RETRIES})`,
    );
    if (attempt < HEALTH_CHECK_RETRIES) await sleep(HEALTH_CHECK_DELAY_MS);
  }
  return false;
}

/**
 * Poll the platform for every still-pending submission of a challenge
 */
async function pollChallenge(challenge: any): Promise<void> {
  const platform = platformOfChallenge(challenge);
  const problem = challenge.problem as any;

  const pendingSubs = await POTDSubmission.find({
    challengeId: challenge._id,
    status: "Pending",
  }).populate("userId", "codeforcesId atcoderId");

  if (pendingSubs.length === 0) return;
  logger.info(
    `[potd-finalize] Polling ${pendingSubs.length} pending submissions for challenge ${challenge._id} (${challenge.difficulty}, ${platform})`,
  );

  const now = new Date();
  for (const sub of pendingSubs as any[]) {
    const user = sub.userId as any;
    const handle = user
      ? platform === "codeforces"
        ? user.codeforcesId
        : user.atcoderId
      : null;
    if (!handle) continue;

    const cpUser = await CPUser.findOne({ userId: user._id });
    const isVerified =
      platform === "codeforces" ? cpUser?.cfVerified : cpUser?.acVerified;
    if (!isVerified) continue;

    try {
      const subs = await fetchUserSubmissions(
        handle,
        platform,
        (challenge.windowStart as Date).getTime(),
      );
      const solvedAt = findEarliestAcceptedSolveTime(
        subs,
        problem,
        challenge.windowStart as Date,
        challenge.graceEnd as Date,
        platform,
      );
      if (solvedAt) {
        await POTDSubmission.updateOne(
          { userId: user._id, challengeId: challenge._id },
          { $set: { solvedAt, lastCheckedAt: now } },
        );
      }
    } catch (err) {
      logger.warn(`[potd-finalize] Error polling ${handle}`, { err });
    }

    await sleep(INTER_USER_DELAY_MS);
  }
}

/**
 * For every day whose grace window has ended but which hasn't been finalized yet,
 * poll pending users, recompute all affected ones, then mark the day as finalized
 */
export async function finalize(now: Date = new Date()): Promise<void> {
  const eligible = (await DailyChallenge.find({
    graceEnd: { $lte: now },
    finalizedAt: null,
  }).populate("problem")) as any[];

  if (eligible.length === 0) {
    logger.info(
      "[potd-finalize] No unfinalized days past grace. Nothing to do.",
    );
    return;
  }

  const platformsNeeded = new Set<Platform>(
    eligible.map((c) => platformOfChallenge(c)),
  );
  const platformHealth = new Map<Platform, boolean>();
  for (const platform of platformsNeeded) {
    platformHealth.set(platform, await checkPlatformHealth(platform));
  }
  if (![...platformHealth.values()].some(Boolean)) {
    logger.error(
      "[potd-finalize] All needed platform APIs unreachable. Aborting run; will retry next run.",
    );
    return;
  }

  // Poll pending solves
  for (const challenge of eligible) {
    if (!platformHealth.get(platformOfChallenge(challenge))) continue;
    await pollChallenge(challenge);
  }

  const byDay = new Map<number, any[]>();
  for (const c of eligible) {
    const key = (c.windowStart as Date).getTime();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(c);
  }
  const finalizableChallengeIds: any[] = [];
  const finalizingDayKeys: number[] = [];
  for (const [dayKey, chs] of byDay) {
    const allHealthy = chs.every((c) =>
      platformHealth.get(platformOfChallenge(c)),
    );
    if (!allHealthy) {
      logger.info(
        `[potd-finalize] Deferring day ${new Date(dayKey).toISOString()} - a platform was down.`,
      );
      continue;
    }

    // Auto-preserve streaks if the entire platform has 0 solves for this day
    const chIds = chs.map((c) => c._id);
    const solvedCount = await POTDSubmission.countDocuments({
      challengeId: { $in: chIds },
      solvedAt: { $ne: null },
    });
    if (solvedCount === 0) {
      logger.info(
        `[potd-finalize] Day ${new Date(dayKey).toISOString()} has 0 successful solves. Automatically enabling streakPreserved.`
      );
      await DailyChallenge.updateMany(
        { _id: { $in: chIds } },
        { $set: { streakPreserved: true } }
      );
    }

    finalizingDayKeys.push(dayKey);
    for (const c of chs) finalizableChallengeIds.push(c._id);
  }

  if (finalizableChallengeIds.length === 0) {
    logger.warn("[potd-finalize] No fully-healthy days to finalize this run.");
    return;
  }

  // Affected users = anyone who has a submission on a finalizing day,
  // plus anyone currently carrying a streak
  const participantIds = await POTDSubmission.find({
    challengeId: { $in: finalizableChallengeIds },
  }).distinct("userId");
  const streakHolderIds = await CPUser.find({
    potdCurrentStreak: { $gt: 0 },
  }).distinct("userId");

  const affected = new Map<string, any>();
  for (const id of [...participantIds, ...streakHolderIds])
    affected.set(id.toString(), id);

  const { days } = await buildTimeline(now);
  logger.info(
    `[potd-finalize] Finalizing ${finalizingDayKeys.length} day(s); recomputing ${affected.size} users.`,
  );
  await recomputeUsers([...affected.values()], days, now);

  await DailyChallenge.updateMany(
    { _id: { $in: finalizableChallengeIds } },
    { $set: { finalizedAt: now } },
  );

  logger.info("[potd-finalize] Finalize complete.");
}
