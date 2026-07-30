import CPUser from "@/models/CPUser";
import { logger } from "@/lib/utils";
import dbConnect from "@/lib/mongodb";
import { getUserInfo, getACRankFromRating } from "@/lib/platforms/atcoder";

const INTER_USER_DELAY_MS = 1_000; // AtCoder doesn't rate-limit as aggressively

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncAtCoderRatings() {
  logger.info("[AC-Sync] Starting AtCoder rating sync...");
  await dbConnect();

  try {
    const verifiedUsers = await CPUser.find({
      acVerified: true,
      acHandle: { $exists: true, $ne: "" },
    }).select("_id acHandle userId");

    if (verifiedUsers.length === 0) {
      logger.info("[AC-Sync] No verified AtCoder users found.");
      return;
    }

    logger.info(
      `[AC-Sync] Fetching data for ${verifiedUsers.length} verified handles...`,
    );

    let updatedCount = 0;

    for (const doc of verifiedUsers) {
      try {
        const info = await getUserInfo(doc.acHandle);
        if (!info) continue;

        await CPUser.findByIdAndUpdate(doc._id, {
          $set: {
            acRating: info.rating,
            acRank: getACRankFromRating(info.rating),
            acMaxRating: info.highest_rating,
            acMaxRank: getACRankFromRating(info.highest_rating),
            acLastUpdated: new Date(),
          },
        });

        updatedCount++;
      } catch (err) {
        logger.warn("AtCoder rating sync failed for a user", {
          job: "acSync",
          operation: "sync_user_rating",
          err,
        });
      }

      await sleep(INTER_USER_DELAY_MS);
    }

    logger.info(
      `[AC-Sync] Successfully updated ${updatedCount} CPUser records.`,
    );
  } catch (error: any) {
    logger.error("[AC-Sync] Error during sync:", error.message);
  }
}
