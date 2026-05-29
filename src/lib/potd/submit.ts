import POTDSubmission from "@/models/POTDSubmission";
import CPUser from "@/models/CPUser";
import DailyChallenge from "@/models/POTDDailyChallenge";
import { computePoints } from "@/lib/potd/utils";
import type { Platform } from "@/lib/constants";

/**
 * Process a user's submission for a specific challenge
 */
export async function processSubmission(
  userId: string,
  challenge: any,
  cpUser: any,
  submissions: any[],
  platform: Platform = "codeforces",
  now: Date = new Date(),
): Promise<{ status: string; pointsAwarded: number }> {
  const problem = challenge.problem as any;
  const challengeId = challenge._id;
  const windowStart = challenge.windowStart as Date;
  const windowEnd = challenge.windowEnd as Date;
  const graceEnd = challenge.graceEnd as Date;

  // Find 1st AC for this problem submitted after windowStart
  const acceptedSub = findAcceptedSubmission(
    submissions,
    problem,
    windowStart,
    platform,
  );

  let newStatus: "Pending" | "Accepted" | "Late" | "NotSolved" = "Pending";
  let solvedAt: Date | null = null;
  let pointsAwarded = 0;

  if (acceptedSub) {
    solvedAt = getSubmissionTime(acceptedSub, platform);
    newStatus = solvedAt <= windowEnd ? "Accepted" : "Late";
  } else if (now > graceEnd) {
    newStatus = "NotSolved";
  }

  // Determine if user already solved another challenge for this day
  let alreadySolvedToday = false;
  if (newStatus === "Accepted" || newStatus === "Late") {
    const todaysChallengeIds: any[] = await DailyChallenge.find({
      windowStart: challenge.windowStart,
    }).distinct("_id");

    const otherChallengeIds = todaysChallengeIds.filter(
      (id) => id.toString() !== challengeId.toString(),
    );

    alreadySolvedToday =
      otherChallengeIds.length > 0 &&
      !!(await POTDSubmission.exists({
        userId,
        challengeId: { $in: otherChallengeIds },
        status: "Accepted",
      }));

    const currentStreak = cpUser.potdCurrentStreak ?? 0;
    const effectiveStreak = alreadySolvedToday
      ? Math.max(0, currentStreak - 1)
      : currentStreak;

    pointsAwarded = computePoints(
      problem.rating,
      solvedAt!.getTime(),
      windowEnd.getTime(),
      graceEnd.getTime(),
      effectiveStreak,
    );
  }

  // Atomically update POTDSubmission - returns the PREVIOUS document
  const prevSub = await POTDSubmission.findOneAndUpdate(
    { userId, challengeId },
    {
      $set: {
        status: newStatus,
        solvedAt,
        pointsAwarded,
        solvedInGrace: newStatus === "Late",
        lastCheckedAt: now,
      },
      $setOnInsert: { userId, challengeId },
    },
    { upsert: true, new: false },
  );

  const wasAlreadyFinal =
    prevSub?.status === "Accepted" || prevSub?.status === "Late";

  // If newly finalized, update CPUser stats atomically
  if (!wasAlreadyFinal) {
    if (newStatus === "Accepted") {
      if (!alreadySolvedToday) {
        const expectedStreak = cpUser.potdCurrentStreak ?? 0;
        const newStreak = expectedStreak + 1;

        const updated = await CPUser.findOneAndUpdate(
          { userId, potdCurrentStreak: expectedStreak },
          {
            $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 },
            $max: { potdLongestStreak: newStreak },
            $set: { potdCurrentStreak: newStreak },
          },
        );

        if (!updated) {
          await CPUser.findOneAndUpdate(
            { userId },
            { $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 } },
          );
        }
      } else {
        await CPUser.findOneAndUpdate(
          { userId },
          { $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 } },
        );
      }
    } else if (newStatus === "Late") {
      await CPUser.findOneAndUpdate(
        { userId },
        { $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 } },
      );
    }
  }

  return { status: newStatus, pointsAwarded };
}

/**
 * Find the first accepted submission matching the problem
 */
function findAcceptedSubmission(
  submissions: any[],
  problem: any,
  windowStart: Date,
  platform: Platform,
): any | null {
  if (platform === "codeforces") {
    return (
      submissions.find(
        (s: any) =>
          s.verdict === "OK" &&
          String(s.problem.contestId) === problem.contestId &&
          s.problem.index === problem.problemIndex &&
          new Date(s.creationTimeSeconds * 1000) >= windowStart,
      ) ?? null
    );
  } else {
    const windowStartEpoch = Math.floor(windowStart.getTime() / 1000);
    return (
      submissions.find(
        (s: any) =>
          s.result === "AC" &&
          s.problem_id === problem.problemIndex &&
          s.contest_id === problem.contestId &&
          s.epoch_second >= windowStartEpoch,
      ) ?? null
    );
  }
}

/**
 * Get the submission timestamp
 */
function getSubmissionTime(submission: any, platform: Platform): Date {
  if (platform === "codeforces") {
    return new Date(submission.creationTimeSeconds * 1000);
  } else {
    return new Date(submission.epoch_second * 1000);
  }
}
