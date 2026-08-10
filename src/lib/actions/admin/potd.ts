"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { cp } from "@ronits2407/cp-api";
import dbConnect from "@/lib/mongodb";
import { getRedis } from "@/lib/redis";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import Problem from "@/models/POTDProblem";
import DailyChallenge from "@/models/POTDDailyChallenge";
import POTDSubmission from "@/models/POTDSubmission";

[User, CPUser, Problem, DailyChallenge, POTDSubmission].forEach(
  (m) => m && m.init && m.init(),
);

import { errorToLogMetadata, logger } from "@/lib/utils";
import { canSetPOTD, parseRoles } from "@/lib/roles";
import { IST_OFFSET_MS } from "@/lib/constants";
import type { Platform } from "@/lib/constants";
import {
  computeWindowTimes,
  getTodayISTDateStr,
  windowStartToISTDateStr,
} from "@/lib/potd/utils";
import { syncUserChallenge } from "@/lib/potd/finalize";
import { fetchUserSubmissions } from "@/lib/potd/recompute";
import { getProblemById } from "@/lib/platforms/atcoder";
import {
  fetchProblemContent,
  type ProblemContentSnapshot,
} from "@/lib/platforms/problemContent";

async function checkAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const user = session.user as any;
  if (!canSetPOTD(user.access, parseRoles(user.roles))) {
    logger.warn("Unauthorized POTD admin access attempt", {
      action: "requirePotdAdmin",
    });
    return null;
  }
  return session;
}

// Set Daily Problem

/**
 * Fetch problem metadata from CP platform, upsert Problem doc, create DailyChallenge
 * `dateStr` = YYYY-MM-DD in IST. `difficulty` = Easy | Medium | Hard.
 * Same-day scheduling is allowed; the challenge window ends at EOD IST.
 */
export async function setDailyProblem(
  dateStr: string,
  problemId: string,
  difficulty: "Easy" | "Medium" | "Hard",
  platform: Platform = "codeforces",
  force: boolean = false,
): Promise<{ ok: boolean; error?: string; reuse?: boolean }> {
  const session = await checkAdmin();
  if (!session) return { ok: false, error: "Forbidden" };

  if (!dateStr || !problemId || !difficulty)
    return { ok: false, error: "Missing required fields" };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    return { ok: false, error: "Invalid date format (YYYY-MM-DD)" };

  const parsedDate = new Date(dateStr + "T00:00:00Z");
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== dateStr
  )
    return { ok: false, error: "Invalid date value" };

  const todayIST = getTodayISTDateStr();
  if (dateStr < todayIST)
    return { ok: false, error: "Cannot schedule problems for past dates" };

  const tenDaysAhead = (() => {
    const d = new Date(Date.now() + IST_OFFSET_MS);
    d.setUTCDate(d.getUTCDate() + 10);
    return d.toISOString().slice(0, 10);
  })();
  if (dateStr > tenDaysAhead)
    return { ok: false, error: "Cannot schedule more than 10 days in advance" };

  await dbConnect();

  const { windowStart, windowEnd, graceEnd } = computeWindowTimes(dateStr);

  // Check if this (date, difficulty) slot is already taken
  const existing = await DailyChallenge.findOne({ windowStart, difficulty });
  if (existing)
    return {
      ok: false,
      error: `A ${difficulty} problem is already set for this date`,
    };

  let contestId: string;
  let problemIndex: string;
  let problemName: string;
  let problemRating: number;
  let problemTags: string[];
  let problemContent: ProblemContentSnapshot | null = null;

  if (platform === "codeforces") {
    // Parse CF problem ID format: "158A" or "1234B1"
    const idMatches = problemId.match(/^(\d+)\s*([A-Z0-9]+)$/i);
    if (!idMatches) {
      return {
        ok: false,
        error: "Invalid CF Problem ID. Use format like '158A' or '1234B1'.",
      };
    }
    contestId = idMatches[1];
    problemIndex = idMatches[2].toUpperCase();

    // Check if this problem has already been used
    const existingProblem = await Problem.findOne({
      platform: "codeforces",
      contestId,
      problemIndex,
    });
    if (existingProblem) {
      const previousUsage = await DailyChallenge.findOne({
        problem: existingProblem._id,
      });
      if (previousUsage && !force) {
        const usedDate = windowStartToISTDateStr(previousUsage.windowStart);
        return {
          ok: false,
          reuse: true,
          error: `This problem was already used for a POTD on ${usedDate}. Set it again?`,
        };
      }
    }

    // Fetch CF problem metadata
    try {
      const CACHE_KEY = "cf:problemset:problems:v1";
      const redis = await getRedis();

      let allProblems: any[];
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        allProblems = JSON.parse(cached);
      } else {
        try {
          allProblems = await cp.codeforces.getProblems();
        } catch (e: any) {
          return {
            ok: false,
            error: `CF API error: ${e.message}`,
          };
        }
        await redis.set(CACHE_KEY, JSON.stringify(allProblems), { EX: 86_400 });
      }

      const cfProblem = allProblems.find(
        (p: any) =>
          String(p.contestId) === contestId &&
          p.index.toUpperCase() === problemIndex,
      );
      if (!cfProblem)
        return {
          ok: false,
          error: `Problem ${contestId}${problemIndex} not found in CF problemset`,
        };

      problemName = cfProblem.name;
      problemRating = cfProblem.rating ?? 0;
      problemTags = cfProblem.tags ?? [];
    } catch (err) {
      logger.error("[setDailyProblem] CF API fetch failed", { err });
      return { ok: false, error: "Failed to fetch problem from Codeforces" };
    }
  } else {
    // Parse AC problem ID format: "abc123_a" or "contest_id/task_id"
    const normalizedId = problemId.toLowerCase().replace("/", "_");

    // Check if already used
    const existingProblem = await Problem.findOne({
      platform: "atcoder",
      problemIndex: normalizedId,
    });
    if (existingProblem) {
      const previousUsage = await DailyChallenge.findOne({
        problem: existingProblem._id,
      });
      if (previousUsage && !force) {
        const usedDate = windowStartToISTDateStr(previousUsage.windowStart);
        return {
          ok: false,
          reuse: true,
          error: `This problem was already used for a POTD on ${usedDate}. Set it again?`,
        };
      }
    }

    // Fetch AC problem metadata from kenkoooo API
    try {
      const result = await getProblemById(normalizedId);
      if (!result)
        return {
          ok: false,
          error: `Problem "${problemId}" not found in AtCoder`,
        };

      contestId = result.problem.contest_id;
      problemIndex = result.problem.id;
      problemName = result.problem.name || result.problem.title;
      problemRating = result.difficulty;
      problemTags = [];
    } catch (err) {
      logger.error("[setDailyProblem] AtCoder API fetch failed", { err });
      return { ok: false, error: "Failed to fetch problem from AtCoder" };
    }
  }

  try {
    problemContent = await fetchProblemContent(
      platform,
      contestId,
      problemIndex,
    );
  } catch (err) {
    logger.warn("[setDailyProblem] Problem content fetch failed", {
      platform,
      resourceId: `${contestId}/${problemIndex}`,
      ...errorToLogMetadata(err),
    });
  }

  // Upsert Problem doc
  const problemUpdate: Record<string, unknown> = {
    name: problemName,
    rating: problemRating,
    tags: problemTags,
  };
  if (problemContent) {
    problemUpdate.content = problemContent;
    problemUpdate.contentFetchedAt = new Date();
  }
  const problemDoc = await Problem.findOneAndUpdate(
    { platform, contestId, problemIndex },
    { $set: problemUpdate },
    { upsert: true, returnDocument: "after" },
  );

  await DailyChallenge.create({
    windowStart,
    windowEnd,
    graceEnd,
    problem: problemDoc._id,
    difficulty,
    setBy: session.user.id,
  });

  logger.info("[setDailyProblem] Created", {
    dateStr,
    platform,
    contestId,
    problemIndex,
    difficulty,
  });
  revalidatePath("/internal/potd");

  return { ok: true };
}

// Get Scheduled Challenges

export type ScheduledChallenge = {
  id: string;
  dateStr: string;
  windowStart: string;
  windowEnd: string;
  difficulty: "Easy" | "Medium" | "Hard";
  platform: Platform;
  isToday: boolean;
  problem: {
    contestId: string;
    problemIndex: string;
    name: string;
    rating: number;
  };
};

export async function getScheduledChallenges(): Promise<{
  ok: boolean;
  data?: ScheduledChallenge[];
  error?: string;
}> {
  const session = await checkAdmin();
  if (!session) return { ok: false, error: "Forbidden" };

  await dbConnect();

  const todayIST = getTodayISTDateStr();
  const { windowStart: todayWindowStart } = computeWindowTimes(todayIST);
  // Show today + up to 10 days ahead
  const futureLimit = new Date(
    todayWindowStart.getTime() + 11 * 24 * 60 * 60 * 1000,
  );

  const challenges = await DailyChallenge.find({
    windowStart: { $gte: todayWindowStart, $lte: futureLimit },
  })
    .sort({ windowStart: 1, difficulty: 1 })
    .populate("problem");

  const data: ScheduledChallenge[] = challenges.map((c: any) => {
    const p = c.problem as any;
    const istDate = windowStartToISTDateStr(c.windowStart);
    return {
      id: c._id.toString(),
      dateStr: istDate,
      windowStart: c.windowStart.toISOString(),
      windowEnd: c.windowEnd.toISOString(),
      difficulty: c.difficulty,
      platform: (p.platform || "codeforces") as Platform,
      isToday: istDate === todayIST,
      problem: {
        contestId: p.contestId,
        problemIndex: p.problemIndex,
        name: p.name,
        rating: p.rating,
      },
    };
  });

  return { ok: true, data };
}

// Delete Scheduled Challenge

export async function deleteScheduledChallenge(
  challengeId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await checkAdmin();
  if (!session) return { ok: false, error: "Forbidden" };

  await dbConnect();

  const challenge = await DailyChallenge.findById(challengeId);
  if (!challenge) return { ok: false, error: "Challenge not found" };

  if (challenge.graceEnd < new Date())
    return {
      ok: false,
      error: "Cannot delete a challenge that has already ended",
    };

  await DailyChallenge.deleteOne({ _id: challengeId });
  revalidatePath("/internal/potd");

  return { ok: true };
}

// Get Pending Submissions

export type PendingSubmissionEntry = {
  submissionId: string;
  userId: string;
  userName: string;
  codeforcesId: string;
  status: string;
  lastCheckedAt: string | null;
};

export async function getPendingSubmissions(challengeId: string): Promise<{
  ok: boolean;
  data?: PendingSubmissionEntry[];
  error?: string;
}> {
  const session = await checkAdmin();
  if (!session) return { ok: false, error: "Forbidden" };

  await dbConnect();

  const subs = await POTDSubmission.find({
    challengeId,
    status: "Pending",
  }).populate("userId", "name codeforcesId");

  const data: PendingSubmissionEntry[] = subs.map((s: any) => {
    const u = s.userId as any;
    return {
      submissionId: s._id.toString(),
      userId: u._id.toString(),
      userName: u.name ?? "",
      codeforcesId: u.codeforcesId ?? "",
      status: s.status,
      lastCheckedAt: s.lastCheckedAt ? s.lastCheckedAt.toISOString() : null,
    };
  });

  return { ok: true, data };
}

// Force Sync User

/**
 * Admin: force a CF sync for a specific user/challenge
 * Respects cron locks - aborts if cron is already running.
 * Applies the same status/points/streak semantics as the cron worker:
 *   "Accepted"  -> streak++, full points
 *   "Late"      -> 50% points, streak preserved (not incremented)
 *   "NotSolved "-> no stat changes (streak resets via end-of-day cron)
 */
export async function forceSyncUser(
  targetUserId: string,
  challengeId: string,
): Promise<{ ok: boolean; status?: string; error?: string }> {
  const session = await checkAdmin();
  if (!session) return { ok: false, error: "Forbidden" };

  await dbConnect();

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) return { ok: false, error: "User not found" };

  const challenge =
    await DailyChallenge.findById(challengeId).populate("problem");
  if (!challenge) return { ok: false, error: "Challenge not found" };

  const problem = challenge.problem as any;
  const platform: Platform = problem.platform || "codeforces";

  const targetCPUser = await CPUser.findOne({ userId: targetUserId });

  if (platform === "codeforces") {
    if (!targetUser.codeforcesId)
      return { ok: false, error: "User's CF handle not set" };
    if (!targetCPUser?.cfVerified)
      return { ok: false, error: "User's CF handle not verified" };
  } else {
    if (!targetUser.atcoderId)
      return { ok: false, error: "User's AtCoder handle not set" };
    if (!targetCPUser?.acVerified)
      return { ok: false, error: "User's AtCoder handle not verified" };
  }

  const handle =
    platform === "codeforces" ? targetUser.codeforcesId : targetUser.atcoderId;

  let subs: any[] = [];
  try {
    subs = await fetchUserSubmissions(
      handle,
      platform,
      challenge.windowStart.getTime(),
    );
  } catch (err) {
    logger.warn("[forceSyncUser] API error", { err });
    return { ok: false, error: `Failed to reach ${platform} API` };
  }

  const { status: newStatus } = await syncUserChallenge(
    targetUserId,
    challenge,
    subs,
    platform,
  );

  logger.info("[forceSyncUser] Synced", {
    targetUserId,
    challengeId,
    newStatus,
  });
  revalidatePath("/internal/potd");

  return { ok: true, status: newStatus };
}

// Auto Problem Setting

export type POTDAutoSlotConfig = {
  id: string; // Unique ID per slot Eg. "2026-07-27-Easy"
  dateStr: string;
  difficulty: "Easy" | "Medium" | "Hard";
  ratingMin: number;
  ratingMax: number;
  minContestId?: number;
};

export type POTDCandidateResult = {
  id: string;
  dateStr: string;
  difficulty: "Easy" | "Medium" | "Hard";
  ratingMin: number;
  ratingMax: number;
  minContestId?: number;
  problem: {
    contestId: string;
    problemIndex: string;
    problemId: string;
    name: string;
    rating: number;
    tags: string[];
    platform: "codeforces";
  } | null;
  error?: string;
};

export async function autoFetchPOTDCandidates(
  slots: POTDAutoSlotConfig[],
  excludeProblemIds: string[] = [],
): Promise<{
  ok: boolean;
  candidates?: POTDCandidateResult[];
  error?: string;
}> {
  const session = await checkAdmin();
  if (!session) return { ok: false, error: "Forbidden" };

  if (!Array.isArray(slots) || slots.length === 0) {
    return { ok: false, error: "No slots requested" };
  }

  await dbConnect();

  // Get all used POTD problem IDs to avoid repeating problems
  const usedProblems = await Problem.find({});
  const usedProblemIds = new Set<string>();
  usedProblems.forEach((p: any) => {
    if (p.contestId && p.problemIndex) {
      usedProblemIds.add(`${p.contestId}${p.problemIndex}`.toUpperCase());
    }
  });

  // Also add client-provided exclusions
  excludeProblemIds.forEach((id) => {
    if (id) usedProblemIds.add(id.toUpperCase());
  });

  const ContestQuestion = (await import("@/models/ContestQuestion")).default;

  const candidates: POTDCandidateResult[] = [];
  const currentBatchExcluded = new Set<string>(usedProblemIds);

  for (const slot of slots) {
    const minRating = Number(slot.ratingMin) || 800;
    const maxRating = Number(slot.ratingMax) || 1200;
    const minContestId = Number(slot.minContestId) || 0;

    const excludeList = Array.from(currentBatchExcluded);

    const matchStage: any = {
      rating: { $gte: minRating, $lte: maxRating },
    };
    if (minContestId > 0) {
      matchStage.contestId = { $gte: minContestId };
    }
    if (excludeList.length > 0) {
      matchStage.problemId = { $nin: excludeList };
    }

    const sampleResult = await ContestQuestion.aggregate([
      { $match: matchStage },
      { $sample: { size: 1 } },
    ]);

    if (sampleResult && sampleResult.length > 0) {
      const q = sampleResult[0];
      const pid = String(q.problemId).toUpperCase();
      currentBatchExcluded.add(pid);

      candidates.push({
        id: slot.id,
        dateStr: slot.dateStr,
        difficulty: slot.difficulty,
        ratingMin: minRating,
        ratingMax: maxRating,
        minContestId,
        problem: {
          contestId: String(q.contestId),
          problemIndex: String(q.index).toUpperCase(),
          problemId: pid,
          name: q.name,
          rating: q.rating ?? 0,
          tags: q.tags ?? [],
          platform: "codeforces",
        },
      });
    } else {
      candidates.push({
        id: slot.id,
        dateStr: slot.dateStr,
        difficulty: slot.difficulty,
        ratingMin: minRating,
        ratingMax: maxRating,
        minContestId,
        problem: null,
        error: `No unused problems found for rating range ${minRating}-${maxRating}${minContestId > 0 ? ` (Contest ID >= ${minContestId})` : ""}`,
      });
    }
  }

  return { ok: true, candidates };
}

export async function bulkSetDailyProblems(
  items: Array<{
    dateStr: string;
    difficulty: "Easy" | "Medium" | "Hard";
    problemId: string;
    platform: Platform;
  }>,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  const session = await checkAdmin();
  if (!session) return { ok: false, error: "Forbidden" };

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: "No problems provided to save" };
  }

  let count = 0;
  const errors: string[] = [];

  for (const item of items) {
    const res = await setDailyProblem(
      item.dateStr,
      item.problemId,
      item.difficulty,
      item.platform || "codeforces",
      true,
    );
    if (!res.ok) {
      errors.push(
        `Failed to set ${item.difficulty} for ${item.dateStr}: ${res.error}`,
      );
    } else {
      count++;
    }
  }

  revalidatePath("/internal/potd");

  if (errors.length > 0) {
    return {
      ok: count > 0,
      count,
      error: `Saved ${count} problems. Errors: ${errors.join("; ")}`,
    };
  }

  return { ok: true, count };
}
