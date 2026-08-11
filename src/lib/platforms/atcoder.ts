/**
 * AtCoder utilities
 * Wrapping @ronits2407/cp-api
 */

import {
  cp,
  type ACProblem as SDKACProblem,
  type ACProblemModel,
  type ACSubmission,
  type ACUserInfo,
} from "@ronits2407/cp-api";
import { cachedFetch } from "@/lib/cache";
import { errorToLogMetadata, logger } from "@/lib/utils";

const ATCODER_METADATA_TTL_SECONDS = 86_400;

export type ACProblem = Omit<SDKACProblem, "difficulty">;
export type { ACSubmission, ACUserInfo };
export type ACProblemDifficulty = ACProblemModel;

export async function getContestProblems(
  contestId: string,
): Promise<ACProblem[]> {
  return cachedFetch(
    `ccw:ac:contest_problems:${contestId}`,
    ATCODER_METADATA_TTL_SECONDS,
    async () =>
      (await cp.atcoder.getContestProblems(contestId)).map(
        ({ difficulty: _difficulty, ...problem }) => problem,
      ),
  );
}

export async function getProblemDifficulties(): Promise<
  Record<string, ACProblemDifficulty>
> {
  return cachedFetch(
    "ccw:ac:problem_difficulties:v1",
    ATCODER_METADATA_TTL_SECONDS,
    () => cp.atcoder.getProblemDifficulties(),
  );
}

export async function getProblemById(
  problemId: string,
): Promise<{ problem: ACProblem; difficulty: number } | null> {
  return cachedFetch(
    `ccw:ac:problem:${problemId}:v1`,
    ATCODER_METADATA_TTL_SECONDS,
    async () => {
      const problem = await cp.atcoder.getProblem(problemId);
      if (!problem) return null;
      const { difficulty, ...metadata } = problem;
      return { problem: metadata, difficulty: difficulty ?? 0 };
    },
  );
}

export async function getUserSubmissions(
  handle: string,
  fromSecond: number,
): Promise<ACSubmission[]> {
  return cp.atcoder.getUserSubmissions(handle, { fromSecond });
}

export async function getUserInfo(handle: string): Promise<ACUserInfo | null> {
  try {
    return await cp.atcoder.getUser(handle);
  } catch (err) {
    logger.warn("AtCoder user lookup failed", {
      operation: "get_user_info",
      ...errorToLogMetadata(err),
    });
    return null;
  }
}

export function getACRankFromRating(rating: number): string {
  return cp.atcoder.getRankFromRating(rating);
}

export async function getUserAffiliation(
  handle: string,
): Promise<string | null> {
  return cp.atcoder.getUserAffiliation(handle);
}

export async function isAtCoderAPIReachable(): Promise<boolean> {
  const [health] = await cp.health.check("ATCODER");
  return health?.reachable ?? false;
}
