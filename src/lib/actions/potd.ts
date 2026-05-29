"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import axios from "axios";
import dbConnect from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import Problem from "@/models/POTDProblem";
import DailyChallenge from "@/models/POTDDailyChallenge";
import POTDSubmission from "@/models/POTDSubmission";

// Ensure models are registered (prevents Next.js compiler from tree-shaking unused model imports)
[User, CPUser, Problem, DailyChallenge, POTDSubmission].forEach(
  (m) => m && m.init && m.init(),
);

import { logger } from "@/lib/utils";
import { DIFFICULTY_ORDER } from "@/lib/constants";
import type { Platform } from "@/lib/constants";
import { processSubmission } from "@/lib/potd/submit";
import { getUserSubmissions } from "@/lib/platforms/atcoder";

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

// Get Today's Challenges
// Only returns challenges during the main window (windowStart <= now <= windowEnd).
// During the grace window the problem is intentionally not shown.

export async function getTodayChallenge(): Promise<{
  ok: boolean;
  data?: TodayChallengeData;
  error?: string;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  await dbConnect();

  const now = new Date();
  const challenges = await DailyChallenge.find({
    windowStart: { $lte: now },
    windowEnd: { $gte: now },
  })
    .sort({ difficulty: 1 })
    .populate("problem");

  if (challenges.length === 0)
    return { ok: false, error: "No active challenge" };

  // All challenges for a day share the same window - use 1st
  const first = challenges[0] as any;

  // Batch fetch all submissions for today's challenges in one query
  const challengeIds = challenges.map((c: any) => c._id);
  const submissions = await POTDSubmission.find({
    userId: session.user.id,
    challengeId: { $in: challengeIds },
  }).lean();

  const subMap = new Map(
    submissions.map((s: any) => [s.challengeId.toString(), s]),
  );

  const entries: ChallengeEntry[] = challenges.map((c: any) => {
    const problem = c.problem as any;
    const sub = subMap.get(c._id.toString());
    return {
      challengeId: c._id.toString(),
      difficulty: c.difficulty,
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

  return {
    ok: true,
    data: {
      windowStart: first.windowStart.toISOString(),
      windowEnd: first.windowEnd.toISOString(),
      graceEnd: first.graceEnd.toISOString(),
      challenges: entries,
    },
  };
}

// Sync My Submission

const CF_SUBMISSIONS_COUNT = 200;

/**
 * Manually sync the current user's submission against today's challenge
 * Uses a 3-layer Redis lock pattern:
 *   L1: per-user global sync rate-limit (60s)
 *   L2: per-user per-challenge advisory lock (30s) - prevents double-click races
 *   L3: per-challenge cron lock guard - if cron is running, back off
 */
export async function syncMySubmission(challengeId: string): Promise<{
  ok: boolean;
  status?: string;
  pointsAwarded?: number;
  error?: string;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  const userId = session.user.id;
  const user = session.user as any;

  await dbConnect();

  const cpUser = await CPUser.findOne({ userId });

  // Look up the challenge to determine its platform
  const challenge =
    await DailyChallenge.findById(challengeId).populate("problem");
  if (!challenge) return { ok: false, error: "Challenge not found" };

  const problem = challenge.problem as any;
  const platform: Platform = problem.platform || "codeforces";

  // Verify handle for the appropriate platform
  if (platform === "codeforces") {
    if (!user.codeforcesId) {
      return { ok: false, error: "Codeforces handle not set" };
    }
    if (!cpUser?.cfVerified) {
      return { ok: false, error: "Codeforces handle not verified" };
    }
  } else {
    if (!user.atcoderId) {
      return { ok: false, error: "AtCoder handle not set" };
    }
    if (!cpUser?.acVerified) {
      return { ok: false, error: "AtCoder handle not verified" };
    }
  }

  const redis = await getRedis();

  // L1: Rate-limit - one manual sync per 60s per user
  const rateLimitKey = `potd:sync:ratelimit:${userId}`;
  const rateLimitSet = await redis.set(rateLimitKey, "1", { NX: true, EX: 60 });
  if (!rateLimitSet) {
    const ttl = await redis.ttl(rateLimitKey);
    return { ok: false, error: `Please wait ${ttl}s before syncing again` };
  }

  // L2: Advisory lock - prevents duplicate concurrent requests
  const advisoryKey = `potd:sync:lock:${userId}:${challengeId}`;
  const advisorySet = await redis.set(advisoryKey, "1", { NX: true, EX: 30 });
  if (!advisorySet) {
    await redis.del(rateLimitKey);
    return { ok: false, error: "Sync already in progress" };
  }

  // L3: Check if cron is running for this challenge
  const cronKey = `potd:cron:lock:${challengeId}`;
  const cronRunning = await redis.get(cronKey);
  if (cronRunning) {
    await redis.del(rateLimitKey);
    await redis.del(advisoryKey);
    return {
      ok: false,
      error: "Auto-sync is running. Your result will be updated shortly.",
    };
  }

  try {
    // Don't re-process an already-finalized submission
    const existing = await POTDSubmission.findOne({ userId, challengeId });
    if (existing?.status === "Accepted" || existing?.status === "Late") {
      return {
        ok: true,
        status: existing.status,
        pointsAwarded: existing.pointsAwarded,
      };
    }

    // Fetch submissions based on platform
    let platformSubs: any[] = [];

    if (platform === "codeforces") {
      // Global CF API rate limit
      const globalCFLimitKey = `potd:sync:cf_api_global`;
      const cfApiLocked = await redis.set(globalCFLimitKey, "1", {
        NX: true,
        EX: 2,
      });
      if (!cfApiLocked) {
        await redis.del(rateLimitKey);
        await redis.del(advisoryKey);
        return {
          ok: false,
          error: "Codeforces is busy. Please try again in 5 seconds.",
        };
      }

      const cfUrl = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(user.codeforcesId)}&from=1&count=${CF_SUBMISSIONS_COUNT}`;
      try {
        const { data } = await axios.get(cfUrl, { timeout: 10_000 });
        if (data.status !== "OK") {
          return { ok: false, error: "Codeforces API returned an error" };
        }
        platformSubs = data.result;
      } catch (err) {
        logger.warn("[syncMySubmission] CF API error", { err });
        return { ok: false, error: "Failed to reach Codeforces API" };
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
        return { ok: false, error: "Failed to reach AtCoder API" };
      }
    }

    const { status: newStatus, pointsAwarded } = await processSubmission(
      userId,
      challenge,
      cpUser,
      platformSubs,
      platform,
    );

    revalidatePath("/internal/potd");

    return { ok: true, status: newStatus, pointsAwarded };
  } catch (err) {
    logger.error("[syncMySubmission] Error", { err });
    return { ok: false, error: "An unexpected error occurred" };
  } finally {
    await redis.del(advisoryKey);
    // rate-limit key stays until TTL expires naturally
  }
}

// My Stats

export async function getMyPotdStats(): Promise<{
  ok: boolean;
  data?: {
    totalPoints: number;
    currentStreak: number;
    longestStreak: number;
    totalSolved: number;
    recentSubmissions: Array<{
      challengeId: string;
      status: string;
      solvedAt: string | null;
      pointsAwarded: number;
      platform: Platform;
      problem: {
        contestId: string;
        problemIndex: string;
        name: string;
        rating: number;
      };
    }>;
  };
  error?: string;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  await dbConnect();

  const cpUserDoc = await CPUser.findOne({ userId: session.user.id });

  const subs = await POTDSubmission.find({
    userId: session.user.id,
    status: { $in: ["Accepted", "Late"] },
  })
    .sort({ solvedAt: -1 })
    .limit(20)
    .populate({ path: "challengeId", populate: { path: "problem" } });

  const recentSubmissions = subs.map((s: any) => {
    const challenge = s.challengeId as any;
    const problem = challenge?.problem as any;
    return {
      challengeId: challenge?._id?.toString() ?? "",
      status: s.status,
      solvedAt: s.solvedAt?.toISOString() ?? null,
      pointsAwarded: s.pointsAwarded,
      platform: (problem?.platform || "codeforces") as Platform,
      problem: {
        contestId: problem?.contestId ?? "",
        problemIndex: problem?.problemIndex ?? "",
        name: problem?.name ?? "",
        rating: problem?.rating ?? 0,
      },
    };
  });

  return {
    ok: true,
    data: {
      totalPoints: cpUserDoc?.potdTotalPoints ?? 0,
      currentStreak: cpUserDoc?.potdCurrentStreak ?? 0,
      longestStreak: cpUserDoc?.potdLongestStreak ?? 0,
      totalSolved: cpUserDoc?.potdTotalSolved ?? 0,
      recentSubmissions,
    },
  };
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

export async function getPastProblems(
  limit = 30,
): Promise<{ ok: boolean; data?: PastProblemEntry[]; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  await dbConnect();

  const now = new Date();
  const challenges = await DailyChallenge.find({ graceEnd: { $lt: now } })
    .sort({ windowStart: -1, difficulty: 1 })
    .limit(limit)
    .populate("problem");

  const challengeIds = challenges.map((c: any) => c._id);
  const counts = await POTDSubmission.aggregate([
    {
      $match: {
        challengeId: { $in: challengeIds },
        // Count both normal and grace solves
        status: { $in: ["Accepted", "Late"] },
      },
    },
    { $group: { _id: "$challengeId", count: { $sum: 1 } } },
  ]);

  const countMap = new Map<string, number>(
    counts.map((c: any) => [c._id.toString(), c.count]),
  );

  const data: PastProblemEntry[] = challenges.map((c: any) => {
    const p = c.problem as any;
    return {
      challengeId: c._id.toString(),
      windowStart: c.windowStart.toISOString(),
      difficulty: c.difficulty,
      platform: (p.platform || "codeforces") as Platform,
      problem: {
        contestId: p.contestId,
        problemIndex: p.problemIndex,
        name: p.name,
        rating: p.rating,
      },
      solvedBy: countMap.get(c._id.toString()) ?? 0,
    };
  });

  return { ok: true, data };
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

export async function getPotdLeaderboard(
  view: "weekly" | "monthly",
): Promise<{ ok: boolean; data?: LeaderboardEntry[]; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  await dbConnect();

  const now = new Date();
  const since =
    view === "weekly"
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const rows = await POTDSubmission.aggregate([
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
    // Join cfusers BEFORE sorting so we can use currentStreak as tiebreaker
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
    // Primary: points DESC; Tiebreaker: streak DESC
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
        handle: {
          $ifNull: ["$user.codeforcesId", "$user.atcoderId", ""],
        },
        totalPoints: 1,
        totalSolved: 1,
        currentStreak: 1,
      },
    },
  ]);

  return { ok: true, data: rows };
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

export async function getStreakLeaderboard(): Promise<{
  ok: boolean;
  data?: StreakEntry[];
  error?: string;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "Unauthorized" };

  await dbConnect();

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
    // Primary: streak DESC; Tiebreaker: totalPoints DESC
    .sort({ potdCurrentStreak: -1, potdTotalPoints: -1, potdLongestStreak: -1 })
    .limit(50)
    .populate("userId", "name codeforcesId atcoderId");

  const data: StreakEntry[] = cpUsers.map((cu: any) => {
    const u = cu.userId as any;
    return {
      userId: u?._id?.toString() ?? "",
      name: u?.name ?? "",
      handle: u?.codeforcesId || u?.atcoderId || "",
      currentStreak: cu.potdCurrentStreak ?? 0,
      longestStreak: cu.potdLongestStreak ?? 0,
      totalSolved: cu.potdTotalSolved ?? 0,
      totalPoints: cu.potdTotalPoints ?? 0,
    };
  });

  return { ok: true, data };
}
