/**
 * Codeforces API utilities
 * Wrapping @ronits2407/cp-api SDK
 */

import { cp } from "@ronits2407/cp-api";
import { logger } from "@/lib/utils";

// Re-export types from SDK
export type { CFSubmission, CFUserInfo, CFProblem } from "@ronits2407/cp-api";

/**
 * Fetch user info for one or more handles
 */
export async function getUserInfo(handles: string | string[]) {
  try {
    return await cp.codeforces.getUser(handles);
  } catch (error: any) {
    logger.error("[CF API] getUserInfo error:", error.message);
    throw error;
  }
}

/**
 * Fetch recent submissions for a user
 */
export async function getUserSubmissions(handle: string, count: number = 100) {
  try {
    return await cp.codeforces.getSubmissions(handle, { count });
  } catch (error: any) {
    logger.error("[CF API] getUserSubmissions error:", error.message);
    throw error;
  }
}

/**
 * Fetch ALL of a user's submissions newer than 'sinceMs'
 */
export async function getUserSubmissionsSince(
  handle: string,
  sinceMs: number,
  timeoutMs: number = 10_000,
) {
  try {
    // The SDK handles rate limiting and pagination internally
    return await cp.codeforces.getSubmissionsSince(handle, sinceMs);
  } catch (error: any) {
    logger.error("[CF API] getUserSubmissionsSince error:", error.message);
    throw error;
  }
}

/**
 * Fetch all problems from the problemset
 */
export async function getProblems() {
  try {
    return await cp.codeforces.getProblems();
  } catch (error: any) {
    logger.error("[CF API] getProblems error:", error.message);
    throw error;
  }
}

/**
 * Find a specific problem by contestId and index
 */
export async function getProblemById(contestId: number, index: string) {
  try {
    return await cp.codeforces.getProblem(contestId, index);
  } catch (err) {
    logger.error("[CF API] getProblemById error:", err);
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
