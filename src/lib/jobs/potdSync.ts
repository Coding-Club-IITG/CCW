import dbConnect from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import CPUser from "@/models/CPUser";
import DailyChallenge from "@/models/POTDDailyChallenge";
import POTDSubmission from "@/models/POTDSubmission";
import { logger } from "@/lib/utils";
import { processSubmission } from "@/lib/potd/submit";
import { fetchUserSubmissions, streakResetGuardKey } from "@/lib/potd/recompute";
import { isAtCoderAPIReachable } from "@/lib/platforms/atcoder";
import { isCodeforcesAPIReachable } from "@/lib/platforms/codeforces";
import type { Platform } from "@/lib/constants";

const HEALTH_CHECK_RETRIES = 3;
const HEALTH_CHECK_DELAY_MS = 10_000; // 10s between retries
const INTER_USER_DELAY_MS = 2_100; // CF allows about 1 request/s, so use 2.1s to prevent ban

// Only reset streaks for days whose grace ended within this lookback window
const STREAK_RESET_LOOKBACK_MS = 50 * 60 * 60 * 1000; // ~2 days + margin

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 1: Health check
 * Check if platform API is reachable with some retries.
 */
async function checkPlatformHealth(platform: Platform): Promise<boolean> {
  for (let attempt = 1; attempt <= HEALTH_CHECK_RETRIES; attempt++) {
    const reachable =
      platform === "codeforces"
        ? await isCodeforcesAPIReachable()
        : await isAtCoderAPIReachable();
    if (reachable) return true;
    logger.warn(
      `[potd-sync] ${platform} API unreachable (attempt ${attempt}/${HEALTH_CHECK_RETRIES})`,
    );
    if (attempt < HEALTH_CHECK_RETRIES) await sleep(HEALTH_CHECK_DELAY_MS);
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
      const subs = await fetchUserSubmissions(
        handle,
        platform,
        challenge.windowStart.getTime(),
      );

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
async function resetStreaksForDay(challenges: any[]): Promise<boolean> {
  if (challenges.length === 0) return true;

  const challengeIds = challenges.map((c: any) => c._id);

  // Guard: skip reset if any challenge for this day still has pending submissions
  const pendingCount = await POTDSubmission.countDocuments({
    challengeId: { $in: challengeIds },
    status: "Pending",
  });
  if (pendingCount > 0) {
    logger.info(
      `[potd-sync] Skipping streak reset - ${pendingCount} submissions still pending`,
    );
    return false;
  }

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

  return true;
}

/**
 * Main cron handler
 */
export async function syncPOTDSubmissions(): Promise<void> {
  logger.info("[potd-sync] Starting POTD submission sync...");

  await dbConnect();

  const now = new Date();

  // Find challenges whose grace period has ended (graceEnd <= now)
  const challenges = await DailyChallenge.find({
    graceEnd: { $lte: now },
  }).populate("problem");

  if (challenges.length === 0) {
    logger.info("[potd-sync] No challenges to sync.");
    return;
  }

  // Determine which platforms are needed and check health independently
  const platformsNeeded = new Set<Platform>(
    challenges.map((c: any) => (c.problem as any).platform || "codeforces"),
  );

  const platformHealth = new Map<Platform, boolean>();
  for (const platform of platformsNeeded) {
    const healthy = await checkPlatformHealth(platform);
    platformHealth.set(platform, healthy);
    if (!healthy) {
      logger.warn(
        `[potd-sync] ${platform} API unreachable after retries - skipping ${platform} challenges`,
      );
    }
  }

  const anyHealthy = [...platformHealth.values()].some((v) => v);
  if (!anyHealthy) {
    logger.error(
      "[potd-sync] All platform APIs unreachable. Aborting sync run.",
    );
    return;
  }

  const redis = await getRedis();

  for (const challenge of challenges) {
    const problem = challenge.problem as any;
    const platform: Platform = problem.platform || "codeforces";

    // Skip challenges whose platform API is down
    if (!platformHealth.get(platform)) {
      logger.info(
        `[potd-sync] Skipping challenge ${challenge._id} (${platform} API down)`,
      );
      continue;
    }

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

  // Reset streaks for each recently-ended day that hasn't been processed yet
  // Group challenges by windowStart and process chronologically to handle
  // cron outages where multiple days need streak resets.
  const dayGroups = new Map<number, any[]>();
  for (const c of challenges) {
    const graceEndMs = (c.graceEnd as Date).getTime();
    if (now.getTime() - graceEndMs > STREAK_RESET_LOOKBACK_MS) continue;
    const key = (c.windowStart as Date).getTime();
    if (!dayGroups.has(key)) dayGroups.set(key, []);
    dayGroups.get(key)!.push(c);
  }

  const sortedDays = Array.from(dayGroups.keys()).sort((a, b) => a - b);
  for (const dayKey of sortedDays) {
    const dayChallenges = dayGroups.get(dayKey)!;
    const resetKey = streakResetGuardKey(dayKey);
    const alreadyReset = await redis.get(resetKey);
    if (alreadyReset) continue;

    const resetCompleted = await resetStreaksForDay(dayChallenges);

    // Only mark as processed if reset actually completed (no pending submissions left)
    if (resetCompleted) {
      await redis.set(resetKey, "1", { EX: 7 * 86_400 });
    }
  }

  logger.info("[potd-sync] POTD sync complete.");
}
