/**
 * Contest fetching service
 * Wrapped by @ronits2407/cp-api
 */

import { cp } from "@ronits2407/cp-api";
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
 * Fetch all upcoming contests from all platforms
 */
export async function fetchAllContests(): Promise<RawContest[]> {
  try {
    const upcoming = await cp.contests.getUpcoming();

    const cfCount = upcoming.filter((c) => c.platform === "CODEFORCES").length;
    const acCount = upcoming.filter((c) => c.platform === "ATCODER").length;
    const ccCount = upcoming.filter((c) => c.platform === "CODECHEF").length;
    const lcCount = upcoming.filter((c) => c.platform === "LEETCODE").length;

    logger.info(`[ContestSync] Codeforces: fetched ${cfCount} contests`);
    logger.info(`[ContestSync] AtCoder: fetched ${acCount} contests`);
    logger.info(`[ContestSync] CodeChef: fetched ${ccCount} contests`);
    logger.info(`[ContestSync] LeetCode: fetched ${lcCount} contests`);

    return upcoming.map((c) => ({
      platform: c.platform.toLowerCase() as ContestPlatform,
      platformContestId: String(c.id),
      name: c.name,
      startTime: c.startTime,
      endTime: c.endTime,
      durationSeconds: c.durationSeconds,
      url: c.url,
    }));
  } catch (error: any) {
    logger.error(
      "[ContestSync] fetchAllContests failed:",
      error.message || error,
    );
    return [];
  }
}
