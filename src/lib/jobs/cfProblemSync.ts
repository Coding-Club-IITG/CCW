import axios from "axios";
import CFQuestion from "@/models/CFQuestion";
import { logger } from "@/lib/utils";
import dbConnect from "@/lib/mongodb";

const CODEFORCES_PROBLEMS_URL = "https://codeforces.com/api/problemset.problems";
const BATCH_SIZE = 1000;

export async function syncCodeforcesProblems() {
  logger.info("[CF-Problem-Sync] Starting Codeforces problem synchronization...");
  await dbConnect();

  try {
    //  fetch all existing problemIds from database to perform incremental sync
    const existingQuestions = await CFQuestion.find({}, { problemId: 1 }).lean();
    const existingProblemIds = new Set(existingQuestions.map((q) => q.problemId));
    const isFirstRun = existingProblemIds.size === 0;

    if (isFirstRun) {
      logger.info("[CF-Problem-Sync] Database is empty. Performing full ingest...");
    } else {
      logger.info(`[CF-Problem-Sync] Found ${existingProblemIds.size} existing problems. Running incremental sync...`);
    }


    const response = await axios.get(CODEFORCES_PROBLEMS_URL);

    if (response.data.status !== "OK") {
      throw new Error(`Codeforces API error: ${response.data.comment || "Unknown"}`);
    }

    const { problems } = response.data.result;

    if (!problems || !Array.isArray(problems)) {
      throw new Error("Invalid problems list returned by Codeforces API.");
    }


    const newProblems = problems.filter((prob: any) => {
      if (!prob.contestId || !prob.index) return false;
      const problemId = `${prob.contestId}${prob.index}`;
      return !existingProblemIds.has(problemId);
    });

    if (newProblems.length === 0) {
      logger.info("[CF-Problem-Sync] No new problems found. Database is already up to date.");
      return;
    }

    logger.info(`[CF-Problem-Sync] Found ${newProblems.length} new problems to sync.`);


    const bulkOps = newProblems.map((prob: any) => {
      const problemId = `${prob.contestId}${prob.index}`;
      const rating = prob.rating;

      return {
        updateOne: {
          filter: { problemId },
          update: {
            $set: {
              contestId: prob.contestId,
              index: prob.index,
              name: prob.name,
              rating,
              tags: prob.tags || [],
            },
          },
          upsert: true,
        },
      };
    });


    for (let i = 0; i < bulkOps.length; i += BATCH_SIZE) {
      const batch = bulkOps.slice(i, i + BATCH_SIZE);
      await CFQuestion.bulkWrite(batch);
      logger.info(
        `[CF-Problem-Sync] Successfully processed batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(
          bulkOps.length / BATCH_SIZE
        )}`
      );
    }

    logger.info(`[CF-Problem-Sync] Sync complete. Added ${newProblems.length} new problems.`);
  } catch (error: any) {
    logger.error("[CF-Problem-Sync] Fatal error during Codeforces problem sync:", error);
    throw error; // Rethrow to let BullMQ handle attempts and delay
  }
}
