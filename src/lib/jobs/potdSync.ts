import axios from "axios";
import dbConnect from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import CPUser from "@/models/CPUser";
import DailyChallenge from "@/models/POTDDailyChallenge";
import POTDSubmission from "@/models/POTDSubmission";
import { logger } from "@/lib/utils";
import { processSubmission } from "@/lib/potd/submit";
import { getUserSubmissions } from "@/lib/platforms/atcoder";
import type { Platform } from "@/lib/constants";

const CF_SUBMISSIONS_COUNT = 100;
const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 mins between health-check retries
const MAX_RETRIES = 6;
const INTER_USER_DELAY_MS = 2_100; // CF allows about 1 request/s, so use 2.1s to prevent ban

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 1: Health check
 * Verify CF API is reachable. Retries up to MAX_RETRIES times,
 * waiting RETRY_DELAY_MS between attempts.
 */
async function waitForCFApi(): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data } = await axios.get(
        "https://codeforces.com/api/user.info?handles=tourist",
        { timeout: 8_000 },
      );
      if (data.status === "OK") return true;
    } catch {
      logger.warn(
        `[potd-sync] CF API unreachable (attempt ${attempt}/${MAX_RETRIES})`,
      );
    }
    if (attempt < MAX_RETRIES) await sleep(RETRY_DELAY_MS);
  }
  return false;
}

/**
 * Phase 2: Sync pending submissions
 * For all POTDSubmissions with status=Pending for the challenge that just ended,
 * fetch submissions from the appropriate platform and update each user atomically.
 */
async function syncPendingSubmissions(challenge: any): Promise<void> {
  const problem = challenge.problem as any;
  const platform: Platform = problem.platform || "codeforces";

  const pendingSubs = await POTDSubmission.find({
    challengeId: challenge._id,
    status: { $in: ["Pending"] },
  }).populate("userId", "codeforcesId atcoderId");

  logger.info(
    `[potd-sync] Syncing ${pendingSubs.length} pending submissions for challenge ${challenge._id} (${challenge.difficulty}, ${platform})`,
  );

  const now = new Date();
  const graceEnd = challenge.graceEnd as Date;

  for (const sub of pendingSubs) {
    const user = sub.userId as any;
    if (!user) {
      if (now > graceEnd) {
        await POTDSubmission.findByIdAndUpdate(sub._id, {
          $set: { status: "NotSolved", lastCheckedAt: now },
        });
      }
      continue;
    }

    const handle =
      platform === "codeforces" ? user.codeforcesId : user.atcoderId;
    if (!handle) {
      if (now > graceEnd) {
        await POTDSubmission.findByIdAndUpdate(sub._id, {
          $set: { status: "NotSolved", lastCheckedAt: now },
        });
      }
      continue;
    }

    const cpUser = await CPUser.findOne({ userId: user._id });
    const isVerified =
      platform === "codeforces" ? cpUser?.cfVerified : cpUser?.acVerified;
    if (!isVerified) {
      if (now > graceEnd) {
        await POTDSubmission.findByIdAndUpdate(sub._id, {
          $set: { status: "NotSolved", lastCheckedAt: now },
        });
      }
      continue;
    }

    try {
      let subs: any[] = [];

      if (platform === "codeforces") {
        const cfUrl = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=${CF_SUBMISSIONS_COUNT}`;
        const { data } = await axios.get(cfUrl, { timeout: 10_000 });
        if (data.status !== "OK") {
          logger.warn(`[potd-sync] CF API bad status for ${handle}`);
          continue;
        }
        subs = data.result;
      } else {
        const windowStartEpoch = Math.floor(
          challenge.windowStart.getTime() / 1000,
        );
        subs = await getUserSubmissions(handle, windowStartEpoch);
      }

      await processSubmission(user._id, challenge, cpUser, subs, platform);
    } catch (err) {
      logger.warn(`[potd-sync] Error syncing ${handle}`, { err });
    }

    await sleep(INTER_USER_DELAY_MS);
  }
}

/**
 * Phase 3: Streak reset
 * Reset streaks only for users who solved nothing today - neither in main or grace window.
 */
async function resetStreaksForDay(challenges: any[]): Promise<void> {
  if (challenges.length === 0) return;

  const challengeIds = challenges.map((c: any) => c._id);

  // Find User IDs that solved at least one challenge today
  const savedUserIds = await POTDSubmission.find({
    challengeId: { $in: challengeIds },
    status: { $in: ["Accepted", "Late"] },
  }).distinct("userId");

  // Reset streak for everyone who had no solve at all today
  const result = await CPUser.updateMany(
    {
      userId: { $nin: savedUserIds },
      potdCurrentStreak: { $gt: 0 },
    },
    { $set: { potdCurrentStreak: 0 } },
  );

  if (result.modifiedCount > 0) {
    logger.info(
      `[potd-sync] Reset streaks for ${result.modifiedCount} users who missed today's challenges`,
    );
  }
}

/**
 * Main cron handler
 */
export async function syncPOTDSubmissions(): Promise<void> {
  logger.info("[potd-sync] Starting POTD submission sync...");

  await dbConnect();

  const apiReachable = await waitForCFApi();
  if (!apiReachable) {
    logger.error("[potd-sync] CF API unreachable after all retries. Aborting.");
    return;
  }

  const now = new Date();

  // Find challenges whose grace period has ended (graceEnd <= now)
  const challenges = await DailyChallenge.find({
    graceEnd: { $lte: now },
  }).populate("problem");

  if (challenges.length === 0) {
    logger.info("[potd-sync] No challenges to sync.");
    return;
  }

  const redis = await getRedis();

  for (const challenge of challenges) {
    const cronKey = `potd:cron:lock:${challenge._id}`;
    const locked = await redis.set(cronKey, "1", { NX: true, EX: 600 });
    if (!locked) {
      logger.info(
        `[potd-sync] Skipping challenge ${challenge._id} - cron lock already held`,
      );
      continue;
    }

    try {
      await syncPendingSubmissions(challenge);
    } finally {
      await redis.del(cronKey);
    }
  }

  await resetStreaksForDay(challenges);

  logger.info("[potd-sync] POTD sync complete.");
}
