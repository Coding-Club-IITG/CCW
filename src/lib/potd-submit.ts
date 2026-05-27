import POTDSubmission from "@/models/POTDSubmission";
import CFUser from "@/models/CFUser";
import DailyChallenge from "@/models/POTDDailyChallenge";
import { computePoints } from "./potd-utils";

/**
 * Process a user's submission for a specific challenge.
 * Uses findOneAndUpdate with conditions to prevent race-condition double increments.
 */
export async function processSubmission(
  userId: string,
  challenge: any,
  cfUser: any,
  cfSubs: any[],
  now: Date = new Date(),
): Promise<{ status: string; pointsAwarded: number }> {
  const problem = challenge.problem as any;
  const challengeId = challenge._id;
  const windowStart = challenge.windowStart as Date;
  const windowEnd = challenge.windowEnd as Date;
  const graceEnd = challenge.graceEnd as Date;

  // Find 1st AC for this problem submitted after windowStart
  const acceptedSub = cfSubs.find(
    (s: any) =>
      s.verdict === "OK" &&
      s.problem.contestId === problem.cfContestId &&
      s.problem.index === problem.cfIndex &&
      new Date(s.creationTimeSeconds * 1000) >= windowStart,
  );

  let newStatus: "Pending" | "Accepted" | "Late" | "NotSolved" = "Pending";
  let solvedAt: Date | null = null;
  let pointsAwarded = 0;

  if (acceptedSub) {
    solvedAt = new Date(acceptedSub.creationTimeSeconds * 1000);
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

    const currentStreak = cfUser.potdCurrentStreak ?? 0;
    // Points should reflect streak at the start of the day
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

  // Atomically update POTDSubmission — returns the PREVIOUS document
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

  // If newly finalized, update CFUser stats atomically
  if (!wasAlreadyFinal) {
    if (newStatus === "Accepted") {
      if (!alreadySolvedToday) {
        // Use atomic conditional update to prevent race condition:
        // Only increment streak if it hasn't changed since we read it
        const expectedStreak = cfUser.potdCurrentStreak ?? 0;
        const newStreak = expectedStreak + 1;

        const updated = await CFUser.findOneAndUpdate(
          { userId, potdCurrentStreak: expectedStreak },
          {
            $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 },
            $max: { potdLongestStreak: newStreak },
            $set: { potdCurrentStreak: newStreak },
          },
        );

        // If the conditional update didn't match (streak already changed),
        // still add points/solved count without touching streak
        if (!updated) {
          await CFUser.findOneAndUpdate(
            { userId },
            { $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 } },
          );
        }
      } else {
        await CFUser.findOneAndUpdate(
          { userId },
          { $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 } },
        );
      }
    } else if (newStatus === "Late") {
      await CFUser.findOneAndUpdate(
        { userId },
        { $inc: { potdTotalPoints: pointsAwarded, potdTotalSolved: 1 } },
      );
    }
  }

  return { status: newStatus, pointsAwarded };
}
