import type { Platform } from "@/lib/constants";
import {
  fetchProblemContentForScheduling,
  type ProblemContentSnapshot,
} from "@/lib/platforms/problemContent";

export type ContestProblemContent = Pick<
  ProblemContentSnapshot,
  | "title"
  | "statementHtml"
  | "inputSpecificationHtml"
  | "outputSpecificationHtml"
  | "constraintsHtml"
  | "notesHtml"
  | "samples"
  | "timeLimitMs"
  | "memoryLimitMb"
  | "sourceUrl"
>;

export type ContestProblemSelection = {
  platform?: string;
  problemId: string;
};

function splitCodeforcesProblemId(problemId: string): {
  contestId: string;
  problemIndex: string;
} | null {
  const match = problemId.trim().match(/^(\d+)([A-Za-z][A-Za-z0-9]*)$/);
  if (!match) return null;
  return { contestId: match[1], problemIndex: match[2] };
}

export async function fetchContestProblemContent(
  problem: ContestProblemSelection,
): Promise<ContestProblemContent | null> {
  const platform = (problem.platform || "codeforces") as Platform;
  if (platform !== "codeforces") return null;

  const parts = splitCodeforcesProblemId(problem.problemId);
  if (!parts) return null;

  try {
    return await fetchProblemContentForScheduling(
      platform,
      parts.contestId,
      parts.problemIndex,
    );
  } catch {
    return null;
  }
}
