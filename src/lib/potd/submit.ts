/**
 * Pure helpers for solve facts
 */

import type { Platform } from "@/lib/constants";

/**
 * Find the earliest accepted submission matching the problem within the valid window
 */
function findAcceptedSubmission(
  submissions: any[],
  problem: any,
  windowStart: Date,
  platform: Platform,
  graceEnd?: Date,
): any | null {
  if (platform === "codeforces") {
    const matches = submissions.filter(
      (s: any) =>
        s.verdict === "OK" &&
        String(s.problem.contestId) === problem.contestId &&
        s.problem.index === problem.problemIndex &&
        new Date(s.creationTimeSeconds * 1000) >= windowStart &&
        (!graceEnd || new Date(s.creationTimeSeconds * 1000) <= graceEnd),
    );
    // Return earliest AC (CF returns newest-first)
    return matches.length > 0
      ? matches.reduce((earliest, s) =>
          s.creationTimeSeconds < earliest.creationTimeSeconds ? s : earliest,
        )
      : null;
  } else {
    const windowStartEpoch = Math.floor(windowStart.getTime() / 1000);
    const graceEndEpoch = graceEnd
      ? Math.floor(graceEnd.getTime() / 1000)
      : Infinity;
    const matches = submissions.filter(
      (s: any) =>
        s.result === "AC" &&
        s.problem_id === problem.problemIndex &&
        s.epoch_second >= windowStartEpoch &&
        s.epoch_second <= graceEndEpoch,
    );
    // Return earliest AC
    return matches.length > 0
      ? matches.reduce((earliest, s) =>
          s.epoch_second < earliest.epoch_second ? s : earliest,
        )
      : null;
  }
}

/** Get the submission timestamp */
function getSubmissionTime(submission: any, platform: Platform): Date {
  if (platform === "codeforces") {
    return new Date(submission.creationTimeSeconds * 1000);
  } else {
    return new Date(submission.epoch_second * 1000);
  }
}

/**
 * Find timestamp of the earliest accepted solve for a problem within the valid window (main + grace)
 */
export function findEarliestAcceptedSolveTime(
  submissions: any[],
  problem: any,
  windowStart: Date,
  graceEnd: Date,
  platform: Platform,
): Date | null {
  const acceptedSub = findAcceptedSubmission(
    submissions,
    problem,
    windowStart,
    platform,
    graceEnd,
  );
  return acceptedSub ? getSubmissionTime(acceptedSub, platform) : null;
}
