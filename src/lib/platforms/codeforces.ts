/**
 * Codeforces utilities
 * Wrapping @ronits2407/cp-api SDK
 */

import { cp, type CFSubmission } from "@ronits2407/cp-api";
import { getRedis } from "@/lib/redis";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { sharedServerEnv } from "@/lib/env/shared";

const DISTRIBUTED_CODEFORCES_SLOT_KEY = "ccw:platform:codeforces:request-slot";
const DISTRIBUTED_CODEFORCES_SLOT_SECONDS = 2;

export { cp };

// Re-export types from SDK
export type { CFSubmission, CFUserInfo, CFProblem } from "@ronits2407/cp-api";

/**
 * Fetch user info for one or more handles
 */
export async function getUserInfo(handles: string | string[]) {
  return cp.codeforces.getUser(handles);
}

/**
 * Fetch recent submissions for a user
 */
export async function getUserSubmissions(handle: string, count: number = 100) {
  return fetchCodeforcesUserStatus(handle, count);
}

function mockSubmission(
  handle: string,
  targetProblemId: string,
  timeMs: number,
) {
  const match = targetProblemId.match(/^(\d+)([A-Za-z].*)$/);
  const contestId = match ? Number(match[1]) : 0;
  const index = match?.[2] ?? targetProblemId;
  let id = 17;
  for (const char of `${handle}:${targetProblemId}`)
    id = (id * 31 + char.charCodeAt(0)) % 1_000_000_000;
  return {
    id,
    creationTimeSeconds: Math.floor(timeMs / 1000),
    problem: {
      contestId,
      index,
      name: "Development mock",
      type: "PROGRAMMING",
      tags: [],
    },
    author: { members: [{ handle }] },
    programmingLanguage: "GNU C++17",
    verdict: "OK",
    testset: "TESTS",
    passedTestCount: 1,
    timeConsumedMillis: 0,
    memoryConsumedBytes: 0,
  } as CFSubmission;
}

export async function fetchCodeforcesUserStatus(
  handle: string,
  count?: number,
  from: number = 1,
  targetProblemId?: string,
): Promise<CFSubmission[]> {
  logger.debug("Codeforces submissions fetch started", {
    operation: "fetch_submissions",
    count,
    from,
  });
  if (sharedServerEnv.DEV_MOCK_CF_SUBMISSIONS) {
    if (!targetProblemId || from > 1 || count === 0) return [];
    return [mockSubmission(handle, targetProblemId, Date.now())].slice(
      0,
      count,
    );
  }
  return cp.codeforces.getSubmissions(handle, { count, from });
}

/** Cache a user's solved problem IDs in Redis for six hours. */
export async function prefetchUserSolvedHistory(handle: string): Promise<void> {
  const solvedProblems = await cp.codeforces.getUserSolvedProblems(handle);
  const solvedProblemIds = new Set(
    solvedProblems.map((problem) => `${problem.contestId}${problem.index}`),
  );
  const redis = await getRedis();
  const key = `solved:${handle.toLowerCase()}`;
  const pipeline = redis.multi();
  pipeline.del(key);
  pipeline.sAdd(
    key,
    solvedProblemIds.size ? [...solvedProblemIds] : ["__empty__"],
  );
  pipeline.expire(key, 6 * 60 * 60);
  await pipeline.exec();
  logger.info("Codeforces solved-history prefetch completed", {
    operation: "prefetch_solved_history",
    solvedProblemCount: solvedProblemIds.size,
  });
}

/**
 * Fetch ALL of a user's submissions newer than 'sinceMs'
 */
export async function getUserSubmissionsSince(
  handle: string,
  sinceMs: number,
  targetProblemId?: string,
) {
  if (sharedServerEnv.DEV_MOCK_CF_SUBMISSIONS) {
    if (!targetProblemId) return [];
    return [mockSubmission(handle, targetProblemId, sinceMs + 1_000)];
  }
  return cp.codeforces.getSubmissionsSince(handle, sinceMs);
}

/**
 * Coordinate interactive Codeforces requests across CCW processes
 */
export async function acquireDistributedCodeforcesSlot(): Promise<boolean> {
  const redis = await getRedis();
  const acquired = await redis.set(DISTRIBUTED_CODEFORCES_SLOT_KEY, "1", {
    NX: true,
    EX: DISTRIBUTED_CODEFORCES_SLOT_SECONDS,
  });
  return Boolean(acquired);
}

/**
 * Fetch all problems from the problemset
 */
export async function getProblems() {
  return cp.codeforces.getProblems();
}

/**
 * Find a specific problem by contestId and index
 */
export async function getProblemById(contestId: number, index: string) {
  try {
    return await cp.codeforces.getProblem(contestId, index);
  } catch (err) {
    logger.warn("Codeforces problem lookup failed", {
      operation: "get_problem",
      resourceId: `${contestId}${index}`,
      ...errorToLogMetadata(err),
    });
    return null;
  }
}

/**
 * Get the CF rank string from a numeric rating
 */
export function getCFRankFromRating(rating: number): string {
  return cp.codeforces.getRankFromRating(rating);
}

/**
 * Check if Codeforces API is reachable
 */
export async function isCodeforcesAPIReachable(): Promise<boolean> {
  try {
    const healths = await cp.health.check("CODEFORCES");
    return healths[0]?.reachable ?? false;
  } catch {
    return false;
  }
}
