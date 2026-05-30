import Contest from "@/models/Contest";
import { fetchAllContests } from "@/lib/platforms/contests";
import { logger } from "@/lib/utils";
import dbConnect from "@/lib/mongodb";

/**
 * Sync upcoming contests from all platforms
 * Upserts by (platform, platformContestId) and removes stale future contests
 */
export async function syncContests() {
  logger.info("[ContestSync] Starting contest sync...");
  await dbConnect();

  try {
    const contests = await fetchAllContests();
    const now = new Date();
    const syncedIds: Record<string, Set<string>> = {
      codeforces: new Set(),
      atcoder: new Set(),
      codechef: new Set(),
      leetcode: new Set(),
    };

    // Upsert all fetched contests
    for (const contest of contests) {
      syncedIds[contest.platform].add(contest.platformContestId);

      await Contest.updateOne(
        {
          platform: contest.platform,
          platformContestId: contest.platformContestId,
        },
        {
          $set: {
            name: contest.name,
            startTime: contest.startTime,
            endTime: contest.endTime,
            durationSeconds: contest.durationSeconds,
            url: contest.url,
            lastSeenAt: now,
          },
        },
        { upsert: true },
      );
    }

    // Remove stale future contests
    for (const platform of Object.keys(syncedIds)) {
      const ids = Array.from(syncedIds[platform]);
      if (ids.length > 0) {
        await Contest.deleteMany({
          platform,
          startTime: { $gt: now },
          platformContestId: { $nin: ids },
        });
      }
    }

    logger.info(
      `[ContestSync] Sync complete. Total contests upserted: ${contests.length}`,
    );
  } catch (err: any) {
    logger.error("[ContestSync] Sync failed:", err.message || err);
  }
}
