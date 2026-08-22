"use server";

import { err as appError, ok } from "@/lib/api/result";

import { defineAction } from "@/lib/actions/defineAction";

export const getSolveChallenge = defineAction(
  "getSolveChallenge",
  getSolveChallengeAction,
);
export const getTodayChallenge = defineAction(
  "getTodayChallenge",
  getTodayChallengeAction,
);
export const markChallengeOpened = defineAction(
  "markChallengeOpened",
  markChallengeOpenedAction,
);
export const syncMySubmission = defineAction(
  "syncMySubmission",
  syncMySubmissionAction,
);
export const getMyPotdStats = defineAction(
  "getMyPotdStats",
  getMyPotdStatsAction,
);
export const getPastProblems = defineAction(
  "getPastProblems",
  getPastProblemsAction,
);
export const getPotdLeaderboard = defineAction(
  "getPotdLeaderboard",
  getPotdLeaderboardAction,
);
export const getStreakLeaderboard = defineAction(
  "getStreakLeaderboard",
  getStreakLeaderboardAction,
);

import mongoose from "mongoose";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import dbConnect from "@/lib/mongodb";
import { cachedFetch, buildCacheKey, CACHE_TTLS } from "@/lib/cache";
import { getRedis } from "@/lib/redis";
import { prepareSearchQuery } from "@/lib/search";
import { renderProblemMath } from "@/lib/platforms/problemContent";
import User, { type UserRecord } from "@/models/User";
import CPUser from "@/models/CPUser";
import Problem, { type POTDProblemRecord } from "@/models/POTDProblem";
import DailyChallenge, {
  type POTDDailyChallengeRecord,
} from "@/models/POTDDailyChallenge";
import POTDSubmission, {
  type POTDSubmissionRecord,
} from "@/models/POTDSubmission";

// Ensure models are registered (prevents Next.js compiler from tree-shaking unused model imports)
[User, CPUser, Problem, DailyChallenge, POTDSubmission].forEach(
  (m) => m && m.init && m.init(),
);

import { logger, getDisplayName } from "@/lib/utils";
import { DIFFICULTY_ORDER } from "@/lib/constants";
import type { Platform } from "@/lib/constants";
import { syncUserChallenge } from "@/lib/potd/finalize";
import { getUserSubmissions } from "@/lib/platforms/atcoder";
import {
  acquireDistributedCodeforcesSlot,
  getUserSubmissionsSince,
} from "@/lib/platforms/codeforces";

type WithId<T> = T & { _id: mongoose.Types.ObjectId };
type PopulatedChallenge = Omit<WithId<POTDDailyChallengeRecord>, "problem"> & {
  problem: WithId<POTDProblemRecord>;
};
type SubmissionWithChallenge = Omit<
  WithId<POTDSubmissionRecord>,
  "challengeId"
> & { challengeId: PopulatedChallenge };
type PopulatedLeaderboardUser = Pick<
  WithId<UserRecord>,
  "_id" | "name" | "codeforcesId" | "atcoderId" | "pizza_count"
>;

// Types

export type ChallengeEntry = {
  challengeId: string;
  difficulty: "Easy" | "Medium" | "Hard";
  platform: Platform;
  problem: {
    contestId: string;
    problemIndex: string;
    name: string;
    rating: number;
  };
  mySubmission: {
    status: "Pending" | "Accepted" | "Late" | "NotSolved" | "none";
    solvedAt: string | null;
    pointsAwarded: number;
  };
};

export type TodayChallengeData = {
  windowStart: string; // ISO - shared across all challenges for the day
  windowEnd: string; // ISO - EOD IST (18:29 UTC)
  graceEnd: string; // ISO - 2:00 AM IST next day (20:29 UTC)
  challenges: ChallengeEntry[]; // sorted Easy -> Medium -> Hard
};

export type SolveChallengeData = {
  challengeId: string;
  platform: Platform;
  contestId: string;
  problemIndex: string;
  title: string;
  content: {
    statementHtml: string;
    inputSpecificationHtml: string;
    outputSpecificationHtml: string;
    constraintsHtml?: string;
    notesHtml?: string;
    samples: Array<{ input: string; output: string }>;
    timeLimitMs?: number;
    memoryLimitMb?: number;
  } | null;
};

async function getSolveChallengeAction(challengeId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return appError("UNAUTHENTICATED", "Unauthorized");
  if (!mongoose.isValidObjectId(challengeId)) {
    return appError("VALIDATION_ERROR", "Invalid challenge");
  }

  await dbConnect();
  const challenge = await DailyChallenge.findById(challengeId).populate<{
    problem: WithId<POTDProblemRecord>;
  }>("problem");
  if (!challenge) return appError("NOT_FOUND", "Challenge not found");

  const now = new Date();
  if (now < challenge.windowStart || now > challenge.graceEnd) {
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }

  const problem = challenge.problem;
  const content = problem.content;
  return ok({
    challengeId: challenge._id.toString(),
    platform: problem.platform || "codeforces",
    contestId: problem.contestId,
    problemIndex: problem.problemIndex,
    title: problem.name,
    content: content
      ? {
          statementHtml: renderProblemMath(content.statementHtml),
          inputSpecificationHtml: renderProblemMath(
            content.inputSpecificationHtml,
          ),
          outputSpecificationHtml: renderProblemMath(
            content.outputSpecificationHtml,
          ),
          constraintsHtml: content.constraintsHtml
            ? renderProblemMath(content.constraintsHtml)
            : undefined,
          notesHtml: content.notesHtml
            ? renderProblemMath(content.notesHtml)
            : undefined,
          samples: (content.samples || []).map(
            (sample: { input: string; output: string }) => ({
              input: sample.input,
              output: sample.output,
            }),
          ),
          timeLimitMs: content.timeLimitMs || undefined,
          memoryLimitMb: content.memoryLimitMb || undefined,
        }
      : null,
  });
}

// Get Today's Challenges
// Only returns challenges during the main window (windowStart <= now <= windowEnd).
// During the grace window the problem is intentionally not shown.

async function getTodayChallengeAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return appError("UNAUTHENTICATED", "Unauthorized");

  await dbConnect();

  const now = new Date();
  const challenges = await DailyChallenge.find({
    windowStart: { $lte: now },
    windowEnd: { $gte: now },
  })
    .sort({ difficulty: 1 })
    .populate<{ problem: WithId<POTDProblemRecord> }>("problem");

  if (challenges.length === 0)
    return appError("NOT_FOUND", "No active challenge");

  // All challenges for a day share the same window - use 1st
  const first = challenges[0];

  // Batch fetch all submissions for today's challenges in one query
  const challengeIds = challenges.map((challenge) => challenge._id);
  const submissions = await POTDSubmission.find({
    userId: session.user.id,
    challengeId: { $in: challengeIds },
  }).lean();

  const subMap = new Map(
    submissions.map((submission) => [
      submission.challengeId.toString(),
      submission,
    ]),
  );

  const entries: ChallengeEntry[] = challenges.map((challenge) => {
    const problem = challenge.problem;
    const sub = subMap.get(challenge._id.toString());
    return {
      challengeId: challenge._id.toString(),
      difficulty: challenge.difficulty,
      platform: problem.platform || "codeforces",
      problem: {
        contestId: problem.contestId,
        problemIndex: problem.problemIndex,
        name: problem.name,
        rating: problem.rating,
      },
      mySubmission: sub
        ? {
            status: sub.status,
            solvedAt: sub.solvedAt ? sub.solvedAt.toISOString() : null,
            pointsAwarded: sub.pointsAwarded,
          }
        : { status: "none" as const, solvedAt: null, pointsAwarded: 0 },
    };
  });

  // Sort Easy -> Medium -> Hard
  entries.sort(
    (a, b) =>
      (DIFFICULTY_ORDER[a.difficulty] ?? 99) -
      (DIFFICULTY_ORDER[b.difficulty] ?? 99),
  );

  return ok({
    windowStart: first.windowStart.toISOString(),
    windowEnd: first.windowEnd.toISOString(),
    graceEnd: first.graceEnd.toISOString(),
    challenges: entries,
  });
}

// Mark Challenge Opened

/**
 * Seed a Pending POTDSubmission when the user opens/starts a challenge
 *
 * This guarantees the end-of-day cron has a record to evaluate even if the
 * user never manually syncs.
 */
async function markChallengeOpenedAction(challengeId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return appError("UNAUTHENTICATED", "Unauthorized");

  const userId = session.user.id;
  const user = session.user;

  if (!challengeId || !mongoose.isValidObjectId(challengeId))
    return appError("VALIDATION_ERROR", "Invalid challenge");

  await dbConnect();

  const challenge = await DailyChallenge.findById(challengeId).populate<{
    problem: WithId<POTDProblemRecord>;
  }>("problem");
  if (!challenge) return appError("NOT_FOUND", "Challenge not found");

  const now = new Date();
  if (now < challenge.windowStart || now > challenge.graceEnd)
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");

  const problem = challenge.problem;
  const platform: Platform = problem?.platform || "codeforces";

  const cpUser = await CPUser.findOne({ userId });
  if (platform === "codeforces") {
    if (!user.codeforcesId || !cpUser?.cfVerified)
      return appError("VALIDATION_ERROR", "Codeforces handle not verified");
  } else {
    if (!user.atcoderId || !cpUser?.acVerified)
      return appError("VALIDATION_ERROR", "AtCoder handle not verified");
  }

  try {
    await POTDSubmission.updateOne(
      { userId, challengeId },
      { $setOnInsert: { userId, challengeId, status: "Pending" } },
      { upsert: true },
    );
    return ok({});
  } catch (err: unknown) {
    // Duplicate-key from a concurrent upsert is fine - the record exists
    if (err && typeof err === "object" && "code" in err && err.code === 11000)
      return ok({});
    logger.error("[markChallengeOpened] Error", { err });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

// Sync My Submission

/**
 * Manually sync the current user's submission against today's challenge
 * Uses a 3-layer Redis lock pattern:
 *   L1: per-user global sync rate-limit (60s)
 *   L2: per-user per-challenge advisory lock (30s) - prevents double-click races
 *   L3: per-challenge cron lock guard - if cron is running, back off
 */
async function syncMySubmissionAction(challengeId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return appError("UNAUTHENTICATED", "Unauthorized");

  const userId = session.user.id;
  const user = session.user;

  await dbConnect();

  const cpUser = await CPUser.findOne({ userId });

  // Look up the challenge to determine its platform
  const challenge = await DailyChallenge.findById(challengeId).populate<{
    problem: WithId<POTDProblemRecord>;
  }>("problem");
  if (!challenge) return appError("NOT_FOUND", "Challenge not found");

  const problem = challenge.problem;
  const platform: Platform = problem.platform || "codeforces";

  // Verify handle for the appropriate platform
  if (platform === "codeforces") {
    if (!user.codeforcesId) {
      return appError("VALIDATION_ERROR", "Codeforces handle not set");
    }
    if (!cpUser?.cfVerified) {
      return appError("VALIDATION_ERROR", "Codeforces handle not verified");
    }
  } else {
    if (!user.atcoderId) {
      return appError("VALIDATION_ERROR", "AtCoder handle not set");
    }
    if (!cpUser?.acVerified) {
      return appError("VALIDATION_ERROR", "AtCoder handle not verified");
    }
  }

  const redis = await getRedis();

  // L1: Rate-limit - one manual sync per 60s per user
  const rateLimitKey = `potd:sync:ratelimit:${userId}`;
  const rateLimitSet = await redis.set(rateLimitKey, "1", { NX: true, EX: 60 });
  if (!rateLimitSet) {
    const ttl = await redis.ttl(rateLimitKey);
    return appError("RATE_LIMITED", `Please wait ${ttl}s before syncing again`);
  }

  // L2: Advisory lock - prevents duplicate concurrent requests
  const advisoryKey = `potd:sync:lock:${userId}:${challengeId}`;
  const advisorySet = await redis.set(advisoryKey, "1", { NX: true, EX: 30 });
  if (!advisorySet) {
    await redis.del(rateLimitKey);
    return appError("CONFLICT", "Sync already in progress");
  }

  // L3: Check if cron is running for this challenge
  const cronKey = `potd:cron:lock:${challengeId}`;
  const cronRunning = await redis.get(cronKey);
  if (cronRunning) {
    await redis.del(rateLimitKey);
    await redis.del(advisoryKey);
    return appError(
      "SERVICE_UNAVAILABLE",
      "Auto-sync is running. Your result will be updated shortly.",
    );
  }

  try {
    // Don't re-process an already-finalized submission
    const existing = await POTDSubmission.findOne({ userId, challengeId });
    if (existing?.status === "Accepted" || existing?.status === "Late") {
      return ok({
        status: existing.status,
        pointsAwarded: existing.pointsAwarded,
      });
    }

    // Fetch submissions based on platform
    let platformSubs: unknown[] = [];

    if (platform === "codeforces") {
      const cfApiLocked = await acquireDistributedCodeforcesSlot();
      if (!cfApiLocked) {
        await redis.del(rateLimitKey);
        await redis.del(advisoryKey);
        return appError("INTERNAL_ERROR", "An unexpected error occurred.");
      }

      try {
        platformSubs = await getUserSubmissionsSince(
          user.codeforcesId,
          challenge.windowStart.getTime(),
        );
      } catch (err) {
        logger.warn("[syncMySubmission] CF API error", { err });
        return appError(
          "EXTERNAL_DEPENDENCY_FAILURE",
          "Failed to reach Codeforces API",
        );
      }
    } else {
      // AtCoder: fetch submissions from kenkoooo API
      const windowStartEpoch = Math.floor(
        challenge.windowStart.getTime() / 1000,
      );
      try {
        platformSubs = await getUserSubmissions(
          user.atcoderId,
          windowStartEpoch,
        );
      } catch (err) {
        logger.warn("[syncMySubmission] AtCoder API error", { err });
        return appError(
          "EXTERNAL_DEPENDENCY_FAILURE",
          "Failed to reach AtCoder API",
        );
      }
    }

    const { status: newStatus, pointsAwarded } = await syncUserChallenge(
      userId,
      challenge,
      platformSubs,
      platform,
    );

    revalidatePath("/internal/potd");

    return ok({ status: newStatus, pointsAwarded });
  } catch (err) {
    logger.error("[syncMySubmission] Error", { err });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  } finally {
    await redis.del(advisoryKey);
    // rate-limit key stays until TTL expires naturally
  }
}

// My Stats

async function getMyPotdStatsAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return appError("UNAUTHENTICATED", "Unauthorized");

  await dbConnect();

  const cpUserDoc = await CPUser.findOne({ userId: session.user.id });

  const subs = await POTDSubmission.find({
    userId: session.user.id,
    status: { $in: ["Accepted", "Late"] },
  })
    .sort({ solvedAt: -1 })
    .limit(20)
    .populate<{ challengeId: PopulatedChallenge }>({
      path: "challengeId",
      populate: { path: "problem" },
    });

  const recentSubmissions = subs.map((submission) => {
    const challenge = submission.challengeId;
    const problem = challenge?.problem;
    return {
      challengeId: challenge?._id?.toString() ?? "",
      status: submission.status,
      solvedAt: submission.solvedAt?.toISOString() ?? null,
      pointsAwarded: submission.pointsAwarded,
      platform: (problem?.platform || "codeforces") as Platform,
      problem: {
        contestId: problem?.contestId ?? "",
        problemIndex: problem?.problemIndex ?? "",
        name: problem?.name ?? "",
        rating: problem?.rating ?? 0,
      },
    };
  });

  return ok({
    totalPoints: cpUserDoc?.potdTotalPoints ?? 0,
    currentStreak: cpUserDoc?.potdCurrentStreak ?? 0,
    longestStreak: cpUserDoc?.potdLongestStreak ?? 0,
    totalSolved: cpUserDoc?.potdTotalSolved ?? 0,
    recentSubmissions,
  });
}

// Past Problems

export type PastProblemEntry = {
  challengeId: string;
  windowStart: string;
  difficulty: "Easy" | "Medium" | "Hard";
  platform: Platform;
  problem: {
    contestId: string;
    problemIndex: string;
    name: string;
    rating: number;
  };
  solvedBy: number;
};

async function getPastProblemsAction(page = 1, limit = 30, search?: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return appError("UNAUTHENTICATED", "Unauthorized");

  await dbConnect();

  const preparedSearch = prepareSearchQuery(search);
  const cacheKey = buildCacheKey("potd:past", {
    page,
    limit,
    search: preparedSearch?.query,
  });
  const skip = (page - 1) * limit;

  const result = await cachedFetch(
    cacheKey,
    CACHE_TTLS.LEADERBOARDS,
    async () => {
      const now = new Date();
      const challengeQuery: Record<string, unknown> = {
        graceEnd: { $lt: now },
      };

      if (preparedSearch) {
        const matchingProblemIds = await Problem.find({
          name: { $regex: preparedSearch.pattern, $options: "i" },
        }).distinct("_id");

        if (matchingProblemIds.length === 0) {
          return { data: [] as PastProblemEntry[], total: 0 };
        }

        challengeQuery.problem = { $in: matchingProblemIds };
      }

      const [challenges, total] = await Promise.all([
        DailyChallenge.find(challengeQuery)
          .sort({ windowStart: -1, difficulty: 1 })
          .skip(skip)
          .limit(limit)
          .populate<{ problem: WithId<POTDProblemRecord> }>("problem"),
        DailyChallenge.countDocuments(challengeQuery),
      ]);

      const challengeIds = challenges.map((challenge) => challenge._id);
      const counts = await POTDSubmission.aggregate<{
        _id: mongoose.Types.ObjectId;
        count: number;
      }>([
        {
          $match: {
            challengeId: { $in: challengeIds },
            status: { $in: ["Accepted", "Late"] },
          },
        },
        { $group: { _id: "$challengeId", count: { $sum: 1 } } },
      ]);

      const countMap = new Map<string, number>(
        counts.map((count) => [count._id.toString(), count.count]),
      );

      const data: PastProblemEntry[] = challenges.map((challenge) => {
        const problem = challenge.problem;
        return {
          challengeId: challenge._id.toString(),
          windowStart: challenge.windowStart.toISOString(),
          difficulty: challenge.difficulty,
          platform: problem.platform || "codeforces",
          problem: {
            contestId: problem.contestId,
            problemIndex: problem.problemIndex,
            name: problem.name,
            rating: problem.rating,
          },
          solvedBy: countMap.get(challenge._id.toString()) ?? 0,
        };
      });

      return { data, total };
    },
  );

  return ok({ items: result.data, total: result.total });
}

// Leaderboard

export type LeaderboardEntry = {
  userId: string;
  name: string;
  handle: string;
  totalPoints: number;
  totalSolved: number;
  currentStreak: number;
};

async function getPotdLeaderboardAction(view: "weekly" | "monthly") {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return appError("UNAUTHENTICATED", "Unauthorized");

  await dbConnect();

  const cacheKey = buildCacheKey("potd:leaderboard", { view });

  const data = await cachedFetch<LeaderboardEntry[]>(
    cacheKey,
    CACHE_TTLS.LEADERBOARDS,
    async () => {
      const now = new Date();
      const since =
        view === "weekly"
          ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const rows = await POTDSubmission.aggregate<
        LeaderboardEntry & { pizza_count: number }
      >([
        {
          $match: {
            status: { $in: ["Accepted", "Late"] },
            solvedAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: "$userId",
            totalPoints: { $sum: "$pointsAwarded" },
            totalSolved: { $sum: 1 },
          },
        },
        {
          $lookup: {
            from: "cpusers",
            localField: "_id",
            foreignField: "userId",
            as: "cpUser",
          },
        },
        { $unwind: { path: "$cpUser", preserveNullAndEmptyArrays: true } },
        {
          $addFields: {
            currentStreak: { $ifNull: ["$cpUser.potdCurrentStreak", 0] },
          },
        },
        { $sort: { totalPoints: -1, currentStreak: -1 } },
        { $limit: 50 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            _id: 0,
            userId: { $toString: "$_id" },
            name: "$user.name",
            pizza_count: { $ifNull: ["$user.pizza_count", 0] },
            handle: {
              $ifNull: ["$user.codeforcesId", "$user.atcoderId", ""],
            },
            totalPoints: 1,
            totalSolved: 1,
            currentStreak: 1,
          },
        },
      ]);

      return rows.map((row) => ({
        ...row,
        name: getDisplayName(row.name, row.pizza_count),
      }));
    },
  );

  return ok(data);
}

// Streak Leaderboard

export type StreakEntry = {
  userId: string;
  name: string;
  handle: string;
  currentStreak: number;
  longestStreak: number;
  totalSolved: number;
  totalPoints: number;
};

async function getStreakLeaderboardAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return appError("UNAUTHENTICATED", "Unauthorized");

  await dbConnect();

  const cacheKey = "ccw:potd:streak-leaderboard";

  const data = await cachedFetch<StreakEntry[]>(
    cacheKey,
    CACHE_TTLS.LEADERBOARDS,
    async () => {
      const cpUsers = await CPUser.find(
        { potdTotalSolved: { $gt: 0 } },
        {
          userId: 1,
          potdCurrentStreak: 1,
          potdLongestStreak: 1,
          potdTotalSolved: 1,
          potdTotalPoints: 1,
        },
      )
        .sort({
          potdCurrentStreak: -1,
          potdTotalPoints: -1,
          potdLongestStreak: -1,
        })
        .limit(50)
        .populate<{ userId: PopulatedLeaderboardUser }>(
          "userId",
          "name codeforcesId atcoderId pizza_count",
        );

      return cpUsers.map((cpUser) => {
        const user = cpUser.userId;
        return {
          userId: user?._id?.toString() ?? "",
          name: getDisplayName(user?.name ?? "", user?.pizza_count),
          handle: user?.codeforcesId || user?.atcoderId || "",
          currentStreak: cpUser.potdCurrentStreak ?? 0,
          longestStreak: cpUser.potdLongestStreak ?? 0,
          totalSolved: cpUser.potdTotalSolved ?? 0,
          totalPoints: cpUser.potdTotalPoints ?? 0,
        };
      });
    },
  );

  return ok(data);
}
