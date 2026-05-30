/**
 * Contest fetching service
 * Fetches upcoming contests from Codeforces, AtCoder, CodeChef, and LeetCode
 */

import axios from "axios";
import { logger } from "@/lib/utils";
import type { ContestPlatform } from "@/lib/constants";

export type RawContest = {
  platform: ContestPlatform;
  platformContestId: string;
  name: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  url: string;
};

/**
 * Fetch upcoming Codeforces contests
 */
async function fetchCodeforcesContests(): Promise<RawContest[]> {
  const response = await axios.get("https://codeforces.com/api/contest.list", {
    timeout: 10000,
  });

  if (response.data.status !== "OK") {
    throw new Error(
      `Codeforces API error: ${response.data.comment || "Unknown"}`,
    );
  }

  const upcoming = response.data.result.filter(
    (c: any) => c.phase === "BEFORE",
  );

  return upcoming.map((c: any) => {
    const startTime = new Date(c.startTimeSeconds * 1000);
    const endTime = new Date((c.startTimeSeconds + c.durationSeconds) * 1000);
    return {
      platform: "codeforces" as const,
      platformContestId: String(c.id),
      name: c.name,
      startTime,
      endTime,
      durationSeconds: c.durationSeconds,
      url: `https://codeforces.com/contest/${c.id}`,
    };
  });
}

/**
 * Fetch upcoming AtCoder contests via Kenkoooo's API
 */
async function fetchAtCoderContests(): Promise<RawContest[]> {
  const response = await axios.get(
    "https://kenkoooo.com/atcoder/resources/contests.json",
    { timeout: 10000 },
  );

  const now = Date.now() / 1000;
  const upcoming = response.data.filter((c: any) => c.start_epoch_second > now);

  return upcoming.map((c: any) => {
    const startTime = new Date(c.start_epoch_second * 1000);
    const endTime = new Date((c.start_epoch_second + c.duration_second) * 1000);
    return {
      platform: "atcoder" as const,
      platformContestId: c.id,
      name: c.title,
      startTime,
      endTime,
      durationSeconds: c.duration_second,
      url: `https://atcoder.jp/contests/${c.id}`,
    };
  });
}

/**
 * Fetch upcoming CodeChef contests
 */
async function fetchCodeChefContests(): Promise<RawContest[]> {
  const response = await axios.get(
    "https://www.codechef.com/api/list/contests/all",
    {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
      },
    },
  );

  const futureContests = response.data?.future_contests || [];

  return futureContests.map((c: any) => {
    const startTime = new Date(c.contest_start_date_iso);
    const endTime = new Date(c.contest_end_date_iso);
    const durationSeconds = Math.floor(
      (endTime.getTime() - startTime.getTime()) / 1000,
    );
    return {
      platform: "codechef" as const,
      platformContestId: c.contest_code,
      name: c.contest_name,
      startTime,
      endTime,
      durationSeconds,
      url: `https://www.codechef.com/${c.contest_code}`,
    };
  });
}

/**
 * Fetch upcoming LeetCode contests
 */
async function fetchLeetCodeContests(): Promise<RawContest[]> {
  const query = `
    query {
      upcomingContests {
        title
        titleSlug
        startTime
        duration
      }
    }
  `;

  const response = await axios.post(
    "https://leetcode.com/graphql",
    { query },
    {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    },
  );

  const contests = response.data?.data?.upcomingContests || [];

  return contests.map((c: any) => {
    const startTime = new Date(c.startTime * 1000);
    const endTime = new Date((c.startTime + c.duration) * 1000);
    return {
      platform: "leetcode" as const,
      platformContestId: c.titleSlug,
      name: c.title,
      startTime,
      endTime,
      durationSeconds: c.duration,
      url: `https://leetcode.com/contest/${c.titleSlug}`,
    };
  });
}

/**
 * Fetch all upcoming contests from all platforms.
 * Uses Promise.allSettled so one failing platform doesn't break the sync.
 */
export async function fetchAllContests(): Promise<RawContest[]> {
  const results = await Promise.allSettled([
    fetchCodeforcesContests(),
    fetchAtCoderContests(),
    fetchCodeChefContests(),
    fetchLeetCodeContests(),
  ]);

  const allContests: RawContest[] = [];

  const platformNames = ["Codeforces", "AtCoder", "CodeChef", "LeetCode"];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      logger.info(
        `[ContestSync] ${platformNames[index]}: fetched ${result.value.length} contests`,
      );
      allContests.push(...result.value);
    } else {
      logger.error(
        `[ContestSync] ${platformNames[index]} fetch failed:`,
        result.reason?.message || result.reason,
      );
    }
  });

  return allContests;
}
