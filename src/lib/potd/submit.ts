import mongoose from "mongoose";
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

  // Find 1st AC for this problem submitted within the valid window
  const acceptedSub = findAcceptedSubmission(
    submissions,
    problem,
    windowStart,
    platform,
    graceEnd,
  );

  let newStatus: "Pending" | "Accepted" | "Late" | "NotSolved" = "Pending";
  let solvedAt: Date | null = null;
  let pointsAwarded = 0;

  if (acceptedSub) {
    solvedAt = getSubmissionTime(acceptedSub, platform);
    if (solvedAt <= windowEnd) {
      newStatus = "Accepted";
    } else if (solvedAt <= graceEnd) {
      newStatus = "Late";
    } else {
      // Solved after grace period — does not count
      solvedAt = null;
      newStatus = now > graceEnd ? "NotSolved" : "Pending";
    }
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

  // Use a transaction to atomically update POTDSubmission + CPUser
  const session = await mongoose.startSession();
  try {
    let resultStatus = newStatus as string;
    let resultPoints = pointsAwarded;

    await session.withTransaction(async () => {
      // Update POTDSubmission - returns the PREVIOUS document
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
        { upsert: true, new: false, session },
      );

      const wasAlreadyFinal =
        prevSub?.status === "Accepted" || prevSub?.status === "Late";

      // If newly finalized, update CPUser stats
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
              { session },
            );

            if (!updated) {
              // Streak changed concurrently — still award points/solve count
              await CPUser.findOneAndUpdate(
                { userId },
                {
                  $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 },
                },
                { session },
              );
            }
          } else {
            await CPUser.findOneAndUpdate(
              { userId },
              { $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 } },
              { session },
            );
          }
        } else if (newStatus === "Late") {
          await CPUser.findOneAndUpdate(
            { userId },
            { $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 } },
            { session },
          );
        }
      }

      resultStatus = newStatus;
      resultPoints = pointsAwarded;
    });

    return { status: resultStatus, pointsAwarded: resultPoints };
  } finally {
    await session.endSession();
  }
}

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
        s.contest_id === problem.contestId &&
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
