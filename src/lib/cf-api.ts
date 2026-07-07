import { cp, CFSubmission } from "@ronits2407/cp-api";
export { cp };
import { logger } from "./utils";
import { getRedis } from "./redis";

export type CodeforcesSubmission = CFSubmission;

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
    // Use the new Unified SDK instead of manual axios calls
    return await cp.codeforces.getSubmissions(handle, { count, from });
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
    // Utilize the SDK's built-in solved problems aggregator
    const solvedProblems = await cp.codeforces.getUserSolvedProblems(handle);
    const solvedProblemIds = new Set<string>();
    
    for (const prob of solvedProblems) {
      solvedProblemIds.add(`${prob.contestId}${prob.index}`);
    }

    const redis = await getRedis();
    const key = `solved:${handle.toLowerCase()}`;

    const pipeline = redis.multi();
    pipeline.del(key); // Clear existing

    if (solvedProblemIds.size > 0) {
      pipeline.sAdd(key, Array.from(solvedProblemIds));
      logger.info(
        `[cf-api] Cached ${solvedProblemIds.size} solved problems for ${handle}`,
      );
    } else {
      logger.info(`[cf-api] Handle ${handle} has 0 solved problems.`);
      pipeline.sAdd(key, "__empty__");
    }
    
    pipeline.expire(key, 6 * 60 * 60); // 6 hours TTL
    await pipeline.exec();
  } catch (error: any) {
    logger.error(
      `[cf-api] Failed to prefetch solved history for ${handle}:`,
      error.message || error,
    );
    throw error;
  }
}
