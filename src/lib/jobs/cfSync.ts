import CPUser from "@/models/CPUser";
import { logger } from "@/lib/utils";
import dbConnect from "@/lib/mongodb";
import { cp } from "@/lib/cf-api";

const BATCH_SIZE = 50;

export async function syncCodeforcesRatings() {
  logger.info("[CF-Sync] Starting Codeforces rating sync...");
  await dbConnect();

  try {
    const verifiedUsers = await CPUser.find({
      cfVerified: true,
      cfHandle: { $exists: true, $ne: "" },
    }).select("_id cfHandle userId");

    if (verifiedUsers.length === 0) {
      logger.info("[CF-Sync] No verified CF users found.");
      return;
    }

    const handleToDocId: Record<string, string> = {};
    verifiedUsers.forEach((doc: any) => {
      handleToDocId[doc.cfHandle.toLowerCase()] = doc._id.toString();
    });

    const handles = Object.keys(handleToDocId);
    logger.info(
      `[CF-Sync] Fetching data for ${handles.length} verified handles...`,
    );

    const bulkOps: any[] = [];

    for (let i = 0; i < handles.length; i += BATCH_SIZE) {
      const batch = handles.slice(i, i + BATCH_SIZE);

      try {
        const result = await cp.codeforces.getUser(batch);

        for (const cfData of result) {
          const lowerHandle = cfData.handle.toLowerCase();
          const docId = handleToDocId[lowerHandle];

          if (!docId) continue;

          bulkOps.push({
            updateOne: {
              filter: { _id: docId },
              update: {
                $set: {
                  cfHandle: cfData.handle,
                  cfRating: cfData.rating || 0,
                  cfRank: cfData.rank || "Unrated",
                  cfMaxRating: cfData.maxRating || 0,
                  cfMaxRank: cfData.maxRank || "Unrated",
                  cfAvatar: cfData.avatar || "",
                  cfLastUpdated: new Date(),
                },
              },
            },
          });
        }
      } catch (batchErr: any) {
        logger.error(
          `[CF-Sync] Error fetching batch ${i / BATCH_SIZE + 1}: ${batchErr.message}`,
        );
      }
    }

    if (bulkOps.length > 0) {
      await CPUser.bulkWrite(bulkOps);
      logger.info(
        `[CF-Sync] Successfully updated ${bulkOps.length} CPUser records.`,
      );
    }
  } catch (error: any) {
    logger.error("[CF-Sync] Error during sync:", error.message);
  }
}
