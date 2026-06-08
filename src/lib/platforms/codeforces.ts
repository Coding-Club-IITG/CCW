/**
 * Codeforces API utilities
 * https://codeforces.com/apiHelp
 */

import axios from "axios";
import { cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { logger } from "@/lib/utils";

const CF_API_BASE = "https://codeforces.com/api";

// Types

export type CFSubmission = {
  id: number;
  contestId: number;
  problem: {
    contestId: number;
    index: string;
    name: string;
    rating?: number;
  };
  verdict: string;
  creationTimeSeconds: number;
};

export type CFUserInfo = {
  handle: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
  avatar?: string;
  firstName?: string;
  lastName?: string;
};

export type CFProblem = {
  contestId: number;
  index: string;
  name: string;
  rating?: number;
  tags?: string[];
};

/**
 * Fetch user info for one or more handles
 */
export async function getUserInfo(
  handles: string | string[],
): Promise<CFUserInfo[]> {
  const handlesParam = Array.isArray(handles) ? handles.join(";") : handles;
  const response = await axios.get(
    `${CF_API_BASE}/user.info?handles=${encodeURIComponent(handlesParam)}`,
  );

  if (response.data.status !== "OK") {
    throw new Error(
      `Codeforces API error: ${response.data.comment || "Unknown"}`,
    );
  }

  return response.data.result;
}

/**
 * Fetch recent submissions for a user
 */
export async function getUserSubmissions(
  handle: string,
  count: number = 100,
): Promise<CFSubmission[]> {
  const response = await axios.get(
    `${CF_API_BASE}/user.status?handle=${encodeURIComponent(handle)}&from=1&count=${count}`,
  );

  if (response.data.status !== "OK") {
    throw new Error(
      `Codeforces API error: ${response.data.comment || "Unknown"}`,
    );
  }

  return response.data.result;
}

const CF_PAGE_SIZE = 1000;
const CF_MAX_PAGES = 20; // Safety cap: up to 20k submissions
const CF_PAGE_DELAY_MS = 1100; // Stay under ~1 req/s limit when paging

/**
 * Fetch ALL of a user's submissions newer than 'sinceMs'
 */
export async function getUserSubmissionsSince(
  handle: string,
  sinceMs: number,
  timeoutMs: number = 10_000,
): Promise<CFSubmission[]> {
  const sinceSeconds = Math.floor(sinceMs / 1000);
  const collected: CFSubmission[] = [];
  let from = 1;

  for (let page = 0; page < CF_MAX_PAGES; page++) {
    if (page > 0) {
      await new Promise((resolve) => setTimeout(resolve, CF_PAGE_DELAY_MS));
    }

    const response = await axios.get(
      `${CF_API_BASE}/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${CF_PAGE_SIZE}`,
      { timeout: timeoutMs },
    );

    if (response.data.status !== "OK") {
      throw new Error(
        `Codeforces API error: ${response.data.comment || "Unknown"}`,
      );
    }

    const batch: CFSubmission[] = response.data.result;
    if (batch.length === 0) break;

    collected.push(...batch);

    // Submissions are newest-first - the last element is the oldest in the batch
    const oldest = batch[batch.length - 1];
    if (oldest.creationTimeSeconds < sinceSeconds) break;
    if (batch.length < CF_PAGE_SIZE) break;

    from += CF_PAGE_SIZE;
  }

  return collected;
}

/**
 * Fetch all problems from the problemset, optionally filtered
 */
export async function getProblems(): Promise<{
  problems: CFProblem[];
  problemStatistics: any[];
}> {
  return cachedFetch(
    "ccw:cf:problemset",
    CACHE_TTLS.CF_PROBLEMSET,
    async () => {
      const response = await axios.get(`${CF_API_BASE}/problemset.problems`);
      if (response.data.status !== "OK") {
        throw new Error(
          `Codeforces API error: ${response.data.comment || "Unknown"}`,
        );
      }
      return response.data.result;
    },
  );
}

/**
 * Find a specific problem by contestId and index
 */
export async function getProblemById(
  contestId: number,
  index: string,
): Promise<CFProblem | null> {
  try {
    const { problems } = await getProblems();
    return (
      problems.find(
        (p) =>
          p.contestId === contestId &&
          p.index.toUpperCase() === index.toUpperCase(),
      ) || null
    );
  } catch (err) {
    logger.error("[CF API] getProblemById error:", err);
    return null;
  }
}

/**
 * Get the CF rank string from a numeric rating
 */
export function getCFRankFromRating(rating: number): string {
  if (rating < 1200) return "Newbie";
  if (rating < 1400) return "Pupil";
  if (rating < 1600) return "Specialist";
  if (rating < 1900) return "Expert";
  if (rating < 2100) return "Candidate Master";
  if (rating < 2300) return "Master";
  if (rating < 2400) return "International Master";
  if (rating < 2600) return "Grandmaster";
  if (rating < 3000) return "International Grandmaster";
  return "Legendary Grandmaster";
}

/**
 * Check if Codeforces API is reachable
 */
export async function isCodeforcesAPIReachable(): Promise<boolean> {
  try {
    const response = await axios.get(
      `${CF_API_BASE}/user.info?handles=tourist`,
      { timeout: 5000 },
    );
    return response.data.status === "OK";
  } catch {
    return false;
  }
}
