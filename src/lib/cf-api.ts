import axios from "axios";
import { logger } from "./utils";
import { getRedis } from "./redis";

export interface CodeforcesSubmission {
  id: number;
  contestId?: number;
  creationTimeSeconds: number;
  relativeTimeSeconds: number;
  problem: {
    contestId?: number;
    index: string;
    name: string;
    type: string;
    rating?: number;
    tags: string[];
  };
  author: {
    contestId?: number;
    members: { handle: string }[];
    participantType: string;
    ghost: boolean;
    startTimeSeconds?: number;
  };
  programmingLanguage: string;
  verdict?: string;
  testset: string;
  passedTestCount: number;
  timeConsumedMillis: number;
  memoryConsumedBytes: number;
}

/**
 * Fetches user submissions from Codeforces.
 * @param handle The Codeforces handle.
 * @param count Number of recent submissions to fetch. If omitted, fetches all.
 * @returns Array of CodeforcesSubmission.
 */
export async function fetchCodeforcesUserStatus(
  handle: string,
  count?: number,
  from: number = 1,
): Promise<CodeforcesSubmission[]> {
  try {
    logger.info(
      `[cf-api] fetchCodeforcesUserStatus called for handle: ${handle}, count: ${count}`,
    );

    const url = count
      ? `https://codeforces.com/api/user.status?handle=${handle}&from=${from}&count=${count}`
      : `https://codeforces.com/api/user.status?handle=${handle}`;

    const response = await axios.get(url, {
      timeout: 10000, // 10 seconds timeout
    });

    if (response.data.status !== "OK") {
      throw new Error(
        `Codeforces API returned non-OK status: ${response.data.comment || "Unknown error"}`,
      );
    }

    return response.data.result;
  } catch (error: any) {
    logger.error(
      `[cf-api] Error fetching status for handle ${handle}:`,
      error.message || error,
    );
    throw error;
  }
}

/**
 * Service function to prefetch a user's Codeforces solved history and store it as a Redis SET.
 * TTL: 6 hours (21600 seconds)
 * Redis Key: solved:<cfHandle>
 * @param handle The Codeforces handle.
 */
export async function prefetchUserSolvedHistory(handle: string): Promise<void> {
  logger.info(`[cf-api] Prefetching solved history for handle: ${handle}`);
  try {
    // Fetch all submissions to build the solved history
    const submissions = await fetchCodeforcesUserStatus(handle);

    const solvedProblemIds = new Set<string>();
    for (const sub of submissions) {
      if (sub.verdict === "OK" && sub.problem.contestId && sub.problem.index) {
        solvedProblemIds.add(`${sub.problem.contestId}${sub.problem.index}`);
      }
    }

    const redis = await getRedis();
    const key = `solved:${handle.toLowerCase()}`;

    if (solvedProblemIds.size > 0) {
      // Use pipeline to add elements and set TTL atomically
      const pipeline = redis.multi();
      pipeline.del(key); // Clear existing
      pipeline.sAdd(key, Array.from(solvedProblemIds));
      pipeline.expire(key, 6 * 60 * 60); // 6 hours TTL
      await pipeline.exec();

      logger.info(
        `[cf-api] Cached ${solvedProblemIds.size} solved problems for ${handle}`,
      );
    } else {
      logger.info(`[cf-api] Handle ${handle} has 0 solved problems.`);
      const pipeline = redis.multi();
      pipeline.del(key);
      pipeline.sAdd(key, "__empty__");
      pipeline.expire(key, 6 * 60 * 60);
      await pipeline.exec();
    }
  } catch (error: any) {
    logger.error(
      `[cf-api] Failed to prefetch solved history for ${handle}:`,
      error.message || error,
    );
    throw error;
  }
}
