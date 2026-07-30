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
  logger.debug("Codeforces submissions fetch started", {
    operation: "fetch_submissions",
    count,
    from,
  });
  // Use the new Unified SDK instead of manual axios calls
  return cp.codeforces.getSubmissions(handle, { count, from });
}

/**
 * Service function to prefetch a user's Codeforces solved history and store it as a Redis SET.
 * TTL: 6 hours (21600 seconds)
 * Redis Key: solved:<cfHandle>
 * @param handle The Codeforces handle.
 */
export async function prefetchUserSolvedHistory(handle: string): Promise<void> {
  logger.info("Codeforces solved-history prefetch started", {
    operation: "prefetch_solved_history",
  });
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
    logger.info("Codeforces solved-history prefetch completed", {
      operation: "prefetch_solved_history",
      solvedProblemCount: solvedProblemIds.size,
    });
  } else {
    logger.info("Codeforces solved-history prefetch found no problems", {
      operation: "prefetch_solved_history",
    });
    pipeline.sAdd(key, "__empty__");
  }

  pipeline.expire(key, 6 * 60 * 60); // 6 hours TTL
  await pipeline.exec();
}
