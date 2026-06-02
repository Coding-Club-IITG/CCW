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
