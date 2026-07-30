/**
 * Codeforces API utilities
 * Wrapping @ronits2407/cp-api SDK
 */

import { cp } from "@ronits2407/cp-api";
import { errorToLogMetadata, logger } from "@/lib/utils";

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
  return cp.codeforces.getSubmissions(handle, { count });
}

/**
 * Fetch ALL of a user's submissions newer than 'sinceMs'
 */
export async function getUserSubmissionsSince(
  handle: string,
  sinceMs: number,
  timeoutMs: number = 10_000,
) {
  // The SDK handles rate limiting and pagination internally
  return cp.codeforces.getSubmissionsSince(handle, sinceMs);
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
