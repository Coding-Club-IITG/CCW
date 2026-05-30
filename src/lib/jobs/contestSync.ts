import Contest from "@/models/Contest";
import { fetchAllContests } from "@/lib/platforms/contests";
import { logger } from "@/lib/utils";
import dbConnect from "@/lib/mongodb";

const MAX_PAST_CONTESTS = 100;

/**
 * Sync upcoming contests from all platforms
 * Upserts by (platform, platformContestId) and removes stale future contests.
 * Keeps up to MAX_PAST_CONTESTS past entries in the DB for historical display.
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

    // Remove stale future contests (no longer listed by platforms)
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

    // Trim old past contests to keep at most MAX_PAST_CONTESTS
    const pastCount = await Contest.countDocuments({ endTime: { $lt: now } });
    if (pastCount > MAX_PAST_CONTESTS) {
      const toRemove = pastCount - MAX_PAST_CONTESTS;
      const oldest = await Contest.find({ endTime: { $lt: now } })
        .sort({ endTime: 1 })
        .limit(toRemove)
        .select("_id");
      await Contest.deleteMany({
        _id: { $in: oldest.map((c) => c._id) },
      });
      logger.info(
        `[ContestSync] Trimmed ${toRemove} old past contests (kept ${MAX_PAST_CONTESTS})`,
      );
    }

    logger.info(
      `[ContestSync] Sync complete. Total contests upserted: ${contests.length}`,
    );
  } catch (err: any) {
    logger.error("[ContestSync] Sync failed:", err.message || err);
  }
}
