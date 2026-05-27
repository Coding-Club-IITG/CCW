import axios from "axios";
import CFUser from "@/models/CFUser";
import { logger } from "@/lib/utils";
import dbConnect from "@/lib/mongodb";

const CODEFORCES_API_URL = "https://codeforces.com/api/user.info";
// CF API has URL length limits, batch handles to stay safe
const BATCH_SIZE = 50;

export async function syncCodeforcesRatings() {
  logger.info("[CF-Sync] Starting Codeforces rating sync...");
  await dbConnect();

  try {
    // Only sync verified CF users
    const verifiedUsers = await CFUser.find({
      cfVerified: true,
      handle: { $exists: true, $ne: "" },
    }).select("_id handle userId");

    if (verifiedUsers.length === 0) {
      logger.info("[CF-Sync] No verified CF users found.");
      return;
    }

    // Build handle -> CFUser ID map
    const handleToDocId: Record<string, string> = {};
    verifiedUsers.forEach((doc) => {
      handleToDocId[doc.handle.toLowerCase()] = doc._id.toString();
    });

    const handles = Object.keys(handleToDocId);
    logger.info(
      `[CF-Sync] Fetching data for ${handles.length} verified handles...`,
    );

    // Process in batches
    const bulkOps: any[] = [];

    for (let i = 0; i < handles.length; i += BATCH_SIZE) {
      const batch = handles.slice(i, i + BATCH_SIZE);
      const handlesParam = batch.join(";");

      try {
        const response = await axios.get(
          `${CODEFORCES_API_URL}?handles=${handlesParam}`,
        );

        if (response.data.status !== "OK") {
          logger.error(
            `[CF-Sync] API error for batch ${i / BATCH_SIZE + 1}: ${response.data.comment}`,
          );
          continue;
        }

        for (const cfData of response.data.result) {
          const lowerHandle = cfData.handle.toLowerCase();
          const docId = handleToDocId[lowerHandle];

          if (!docId) continue;

          bulkOps.push({
            updateOne: {
              filter: { _id: docId },
              update: {
                $set: {
                  handle: cfData.handle,
                  rating: cfData.rating || 0,
                  rank: cfData.rank || "Unrated",
                  maxRating: cfData.maxRating || 0,
                  maxRank: cfData.maxRank || "Unrated",
                  avatar: cfData.avatar || "",
                  lastUpdated: new Date(),
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
      await CFUser.bulkWrite(bulkOps);
      logger.info(
        `[CF-Sync] Successfully updated ${bulkOps.length} CFUser records.`,
      );
    }
  } catch (error: any) {
    logger.error("[CF-Sync] Error during sync:", error.message);
  }
}
