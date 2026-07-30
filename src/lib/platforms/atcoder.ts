/**
 * AtCoder API utilities using the kenkoooo AtCoder Problems API
 * https://github.com/kenkoooo/AtCoderProblems
 */

import axios from "axios";
import { cachedFetch } from "@/lib/cache";
import { logger } from "@/lib/utils";

const ATCODER_API_BASE = "https://kenkoooo.com/atcoder";
const ATCODER_MAIN = "https://atcoder.jp";

// Types

export type ACProblem = {
  id: string;
  contest_id: string;
  problem_index: string;
  name: string;
  title: string;
};

export type ACProblemDifficulty = {
  slope?: number;
  intercept?: number;
  variance?: number;
  difficulty?: number;
  discrimination?: number;
  irt_loglikelihood?: number;
  irt_users?: number;
  is_experimental?: boolean;
};

export type ACSubmission = {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  user_id: string;
  language: string;
  point: number;
  length: number;
  result: string;
  execution_time: number | null;
};

export type ACUserInfo = {
  user_id: string;
  rating: number;
  highest_rating: number;
  affiliation: string;
  rank: number;
};

// API Functions

/**
 * Fetch all problems for a specific contest
 */
export async function getContestProblems(
  contestId: string,
): Promise<ACProblem[]> {
  const allProblems = await cachedFetch<ACProblem[]>(
    `ccw:ac:contest_problems:${contestId}`,
    86_400,
    async () => {
      const { data } = await axios.get(
        `${ATCODER_API_BASE}/resources/problems.json`,
        { timeout: 15_000 },
      );
      return data.filter((p: ACProblem) => p.contest_id === contestId);
    },
  );
  return allProblems;
}

/**
 * Fetch problem difficulty ratings (cached for 24h)
 */
export async function getProblemDifficulties(): Promise<
  Record<string, ACProblemDifficulty>
> {
  return cachedFetch<Record<string, ACProblemDifficulty>>(
    "ccw:ac:problem_difficulties:v1",
    86_400,
    async () => {
      const { data } = await axios.get(
        `${ATCODER_API_BASE}/resources/problem-models.json`,
        { timeout: 30_000 },
      );
      return data;
    },
  );
}

/**
 * Fetch a specific problem's metadata by its ID
 */
export async function getProblemById(
  problemId: string,
): Promise<{ problem: ACProblem; difficulty: number } | null> {
  const allProblems = await cachedFetch<ACProblem[]>(
    "ccw:ac:all_problems:v1",
    86_400,
    async () => {
      const { data } = await axios.get(
        `${ATCODER_API_BASE}/resources/problems.json`,
        { timeout: 30_000 },
      );
      return data;
    },
  );

  const problem = allProblems.find((p) => p.id === problemId);
  if (!problem) return null;

  const difficulties = await getProblemDifficulties();
  const diffModel = difficulties[problemId];
  const difficulty = diffModel?.difficulty
    ? Math.round(diffModel.difficulty)
    : 0;

  return { problem, difficulty };
}

/**
 * Fetch recent submissions for a user (from a given epoch second)
 */
export async function getUserSubmissions(
  handle: string,
  fromSecond: number,
): Promise<ACSubmission[]> {
  const { data } = await axios.get(
    `${ATCODER_API_BASE}/atcoder-api/v3/user/submissions`,
    {
      params: { user: handle.toLowerCase(), from_second: fromSecond },
      timeout: 10_000,
    },
  );
  return data;
}

/**
 * Fetch user profile info from AtCoder (for rating sync)
 * Uses the unofficial JSON endpoint
 */
export async function getUserInfo(handle: string): Promise<ACUserInfo | null> {
  try {
    const { data } = await axios.get(
      `${ATCODER_MAIN}/users/${encodeURIComponent(handle)}/history/json`,
      { timeout: 10_000 },
    );

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    // The last entry has the current rating
    const latest = data[data.length - 1];
    let highestRating = 0;
    for (const entry of data) {
      if (entry.NewRating > highestRating) {
        highestRating = entry.NewRating;
      }
    }

    return {
      user_id: handle,
      rating: latest.NewRating ?? 0,
      highest_rating: highestRating,
      affiliation: "",
      rank: 0,
    };
  } catch (err) {
    logger.warn("AtCoder user lookup failed", {
      operation: "get_user_info",
      err,
    });
    return null;
  }
}

/**
 * Get AtCoder rank string from rating
 */
export function getACRankFromRating(rating: number): string {
  if (rating <= 0) return "Unrated";
  if (rating < 400) return "Gray";
  if (rating < 800) return "Brown";
  if (rating < 1200) return "Green";
  if (rating < 1600) return "Cyan";
  if (rating < 2000) return "Blue";
  if (rating < 2400) return "Yellow";
  if (rating < 2800) return "Orange";
  return "Red";
}

/**
 * Fetch user's affiliation from AtCoder profile page (for verification)
 */
export async function getUserAffiliation(
  handle: string,
): Promise<string | null> {
  try {
    const { data: html } = await axios.get(
      `${ATCODER_MAIN}/users/${encodeURIComponent(handle)}`,
      { timeout: 10_000, responseType: "text" },
    );

    // Parse affiliation from the HTML table
    const affiliationMatch = html.match(
      /Affiliation[^<]*<\/th>[^<]*<td[^>]*>([^<]*)<\/td>/i,
    );
    return affiliationMatch ? affiliationMatch[1].trim() : null;
  } catch (err) {
    logger.warn("AtCoder affiliation lookup failed", {
      operation: "get_affiliation",
      err,
    });
    return null;
  }
}

/**
 * Check if AtCoder API is reachable
 */
export async function isAtCoderAPIReachable(): Promise<boolean> {
  try {
    await axios.get(`${ATCODER_API_BASE}/resources/problems.json`, {
      timeout: 8_000,
      headers: { Range: "bytes=0-100" },
    });
    return true;
  } catch {
    return false;
  }
}
