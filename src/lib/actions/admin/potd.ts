"use server";

import { cp } from "@ronits2407/cp-api";
import mongoose from "mongoose";
import type { ClientSession } from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { canSetPOTD } from "@/lib/access/potd";
import { defineAction } from "@/lib/actions/defineAction";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizePOTD } from "@/lib/audit/summary";
import { err as appError, ok } from "@/lib/api/result";
import { auth } from "@/lib/auth";
import { IST_OFFSET_MS, type Platform } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { getProblemById } from "@/lib/platforms/atcoder";
import {
  fetchProblemContentForScheduling,
  type ProblemContentSnapshot,
} from "@/lib/platforms/problemContent";
import { syncUserChallenge } from "@/lib/potd/finalize";
import { fetchUserSubmissions } from "@/lib/potd/recompute";
import {
  computeWindowTimes,
  getTodayISTDateStr,
  windowStartToISTDateStr,
} from "@/lib/potd/utils";
import { getRedis } from "@/lib/redis";
import { parseRoles } from "@/lib/roles";
import { errorToLogMetadata, logger } from "@/lib/utils";
import CPUser from "@/models/CPUser";
import ContestQuestion from "@/models/ContestQuestion";
import DailyChallenge from "@/models/POTDDailyChallenge";
import Problem, { type POTDProblemRecord } from "@/models/POTDProblem";
import POTDSubmission from "@/models/POTDSubmission";
import User, { type UserRecord } from "@/models/User";

[User, CPUser, Problem, DailyChallenge, POTDSubmission].forEach(
  (m) => m && m.init && m.init(),
);

export const setDailyProblem = defineAction(
  "setDailyProblem",
  setDailyProblemAction,
);
export const getScheduledChallenges = defineAction(
  "getScheduledChallenges",
  getScheduledChallengesAction,
);
export const deleteScheduledChallenge = defineAction(
  "deleteScheduledChallenge",
  deleteScheduledChallengeAction,
);
export const getPendingSubmissions = defineAction(
  "getPendingSubmissions",
  getPendingSubmissionsAction,
);
export const forceSyncUser = defineAction("forceSyncUser", forceSyncUserAction);
export const autoFetchPOTDCandidates = defineAction(
  "autoFetchPOTDCandidates",
  autoFetchPOTDCandidatesAction,
);
export const bulkSetDailyProblems = defineAction(
  "bulkSetDailyProblems",
  bulkSetDailyProblemsAction,
);

type WithId<T> = T & { _id: mongoose.Types.ObjectId };
class BulkScheduleError extends Error {}
type CodeforcesProblem = {
  contestId: number;
  index: string;
  name: string;
  rating?: number;
  tags?: string[];
};

function isCodeforcesProblem(value: unknown): value is CodeforcesProblem {
  return Boolean(
    value &&
    typeof value === "object" &&
    "contestId" in value &&
    typeof value.contestId === "number" &&
    "index" in value &&
    typeof value.index === "string" &&
    "name" in value &&
    typeof value.name === "string",
  );
}

async function checkAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const user = session.user;
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
async function setDailyProblemAction(
  dateStr: string,
  problemId: string,
  difficulty: "Easy" | "Medium" | "Hard",
  platform: Platform = "codeforces",
  force: boolean = false,
  parentTransaction?: ClientSession,
) {
  const session = await checkAdmin();
  if (!session) return appError("FORBIDDEN", "Forbidden");

  if (!dateStr || !problemId || !difficulty)
    return appError("VALIDATION_ERROR", "Missing required fields");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr))
    return appError("VALIDATION_ERROR", "Invalid date format (YYYY-MM-DD)");

  const parsedDate = new Date(dateStr + "T00:00:00Z");
  if (
    isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== dateStr
  )
    return appError("VALIDATION_ERROR", "Invalid date value");

  const todayIST = getTodayISTDateStr();
  if (dateStr < todayIST)
    return appError(
      "VALIDATION_ERROR",
      "Cannot schedule problems for past dates",
    );

  const tenDaysAhead = (() => {
    const d = new Date(Date.now() + IST_OFFSET_MS);
    d.setUTCDate(d.getUTCDate() + 10);
    return d.toISOString().slice(0, 10);
  })();
  if (dateStr > tenDaysAhead)
    return appError(
      "VALIDATION_ERROR",
      "Cannot schedule more than 10 days in advance",
    );

  await dbConnect();

  const { windowStart, windowEnd, graceEnd } = computeWindowTimes(dateStr);

  // Check if this (date, difficulty) slot is already taken
  const existing = await DailyChallenge.findOne({ windowStart, difficulty });
  if (existing)
    return appError(
      "CONFLICT",
      `A ${difficulty} problem is already set for this date`,
    );

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
      return appError(
        "VALIDATION_ERROR",
        "Invalid CF Problem ID. Use format like '158A' or '1234B1'.",
      );
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
        return appError(
          "CONFLICT",
          `This problem was already used for a POTD on ${usedDate}. Set it again?`,
        );
      }
    }

    // Fetch CF problem metadata
    try {
      const CACHE_KEY = "cf:problemset:problems:v1";
      const redis = await getRedis();

      let allProblems: CodeforcesProblem[];
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (!Array.isArray(parsed)) {
          return appError(
            "EXTERNAL_DEPENDENCY_FAILURE",
            "Cached Codeforces problem data is invalid.",
          );
        }
        allProblems = parsed.filter(isCodeforcesProblem);
      } else {
        try {
          allProblems = await cp.codeforces.getProblems();
        } catch {
          return appError(
            "EXTERNAL_DEPENDENCY_FAILURE",
            "Codeforces could not provide its problem set.",
          );
        }
        await redis.set(CACHE_KEY, JSON.stringify(allProblems), { EX: 86_400 });
      }

      const cfProblem = allProblems.find(
        (problem) =>
          String(problem.contestId) === contestId &&
          problem.index.toUpperCase() === problemIndex,
      );
      if (!cfProblem)
        return appError(
          "NOT_FOUND",
          `Problem ${contestId}${problemIndex} not found in CF problemset`,
        );

      problemName = cfProblem.name;
      problemRating = cfProblem.rating ?? 0;
      problemTags = cfProblem.tags ?? [];
    } catch (err) {
      logger.error("[setDailyProblem] CF API fetch failed", { err });
      return appError(
        "EXTERNAL_DEPENDENCY_FAILURE",
        "Failed to fetch problem from Codeforces",
      );
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
        return appError(
          "CONFLICT",
          `This problem was already used for a POTD on ${usedDate}. Set it again?`,
        );
      }
    }

    // Fetch AC problem metadata from kenkoooo API
    try {
      const result = await getProblemById(normalizedId);
      if (!result)
        return appError(
          "NOT_FOUND",
          `Problem "${problemId}" not found in AtCoder`,
        );

      contestId = result.problem.contest_id;
      problemIndex = result.problem.id;
      problemName = result.problem.name || result.problem.title;
      problemRating = result.difficulty;
      problemTags = [];
    } catch (err) {
      logger.error("[setDailyProblem] AtCoder API fetch failed", { err });
      return appError(
        "EXTERNAL_DEPENDENCY_FAILURE",
        "Failed to fetch problem from AtCoder",
      );
    }
  }

  try {
    problemContent = await fetchProblemContentForScheduling(
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
  const persist = async (transaction: ClientSession) => {
    const occupied = await DailyChallenge.findOne({ windowStart, difficulty })
      .session(transaction)
      .lean();
    if (occupied)
      throw new Error("POTD slot became occupied during scheduling.");
    const problemDoc = await Problem.findOneAndUpdate(
      { platform, contestId, problemIndex },
      { $set: problemUpdate },
      { upsert: true, returnDocument: "after", session: transaction },
    );
    const [challenge] = await DailyChallenge.create(
      [
        {
          windowStart,
          windowEnd,
          graceEnd,
          problem: problemDoc._id,
          difficulty,
          setBy: session.user.id,
        },
      ],
      { session: transaction },
    );
    const id = String(challenge._id);
    return {
      id,
      audit: {
        actor: auditActor(session.user),
        category: "potd" as const,
        action: "schedule" as const,
        operation: "potd.schedule",
        target: {
          type: "potd-challenge",
          id,
          label: `${dateStr} ${difficulty}`,
        },
        after: summarizePOTD({
          date: dateStr,
          difficulty,
          platform,
          problemId: `${contestId}${problemIndex}`,
          force,
        }),
      },
    };
  };
  if (parentTransaction) {
    await persist(parentTransaction);
  } else {
    const dbSession = await mongoose.startSession();
    try {
      await auditedTransaction(dbSession, async (transaction) => {
        const persisted = await persist(transaction);
        return { result: undefined, audit: persisted.audit };
      });
    } finally {
      await dbSession.endSession();
    }
  }

  if (!parentTransaction) {
    logger.info("[setDailyProblem] Created", {
      dateStr,
      platform,
      contestId,
      problemIndex,
      difficulty,
    });
    revalidatePath("/internal/potd");
  }

  return ok({});
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

async function getScheduledChallengesAction() {
  const session = await checkAdmin();
  if (!session) return appError("FORBIDDEN", "Forbidden");

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
    .populate<{ problem: WithId<POTDProblemRecord> }>("problem");

  const data: ScheduledChallenge[] = challenges.map((challenge) => {
    const problem = challenge.problem;
    const istDate = windowStartToISTDateStr(challenge.windowStart);
    return {
      id: challenge._id.toString(),
      dateStr: istDate,
      windowStart: challenge.windowStart.toISOString(),
      windowEnd: challenge.windowEnd.toISOString(),
      difficulty: challenge.difficulty,
      platform: problem.platform || "codeforces",
      isToday: istDate === todayIST,
      problem: {
        contestId: problem.contestId,
        problemIndex: problem.problemIndex,
        name: problem.name,
        rating: problem.rating,
      },
    };
  });

  return ok(data);
}

// Delete Scheduled Challenge

async function deleteScheduledChallengeAction(challengeId: string) {
  const session = await checkAdmin();
  if (!session) return appError("FORBIDDEN", "Forbidden");

  await dbConnect();

  const challenge = await DailyChallenge.findById(challengeId);
  if (!challenge) return appError("NOT_FOUND", "Challenge not found");

  if (challenge.graceEnd < new Date())
    return appError(
      "CONFLICT",
      "Cannot delete a challenge that has already ended",
    );

  const dbSession = await mongoose.startSession();
  try {
    await auditedTransaction(dbSession, async (transaction) => {
      const current = await DailyChallenge.findById(challengeId)
        .session(transaction)
        .populate("problem");
      if (!current)
        throw new Error("POTD challenge disappeared during deletion.");
      await DailyChallenge.deleteOne(
        { _id: challengeId },
        { session: transaction },
      );
      const problem = current.problem as unknown as POTDProblemRecord;
      const date = windowStartToISTDateStr(current.windowStart);
      return {
        result: undefined,
        audit: {
          actor: auditActor(session.user),
          category: "potd" as const,
          action: "delete" as const,
          operation: "potd.scheduled.delete",
          target: {
            type: "potd-challenge",
            id: challengeId,
            label: `${date} ${current.difficulty}`,
          },
          before: summarizePOTD({
            date,
            difficulty: current.difficulty,
            platform: problem.platform,
            problemId: `${problem.contestId}${problem.problemIndex}`,
          }),
        },
      };
    });
  } finally {
    await dbSession.endSession();
  }
  revalidatePath("/internal/potd");

  return ok({});
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

async function getPendingSubmissionsAction(challengeId: string) {
  const session = await checkAdmin();
  if (!session) return appError("FORBIDDEN", "Forbidden");

  await dbConnect();

  const subs = await POTDSubmission.find({
    challengeId,
    status: "Pending",
  }).populate<{
    userId: Pick<WithId<UserRecord>, "_id" | "name" | "codeforcesId">;
  }>("userId", "name codeforcesId");

  const data: PendingSubmissionEntry[] = subs.map((submission) => {
    const user = submission.userId;
    return {
      submissionId: submission._id.toString(),
      userId: user._id.toString(),
      userName: user.name ?? "",
      codeforcesId: user.codeforcesId ?? "",
      status: submission.status,
      lastCheckedAt: submission.lastCheckedAt
        ? submission.lastCheckedAt.toISOString()
        : null,
    };
  });

  return ok(data);
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
async function forceSyncUserAction(targetUserId: string, challengeId: string) {
  const session = await checkAdmin();
  if (!session) return appError("FORBIDDEN", "Forbidden");

  await dbConnect();

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) return appError("NOT_FOUND", "User not found");

  const challenge = await DailyChallenge.findById(challengeId).populate<{
    problem: WithId<POTDProblemRecord>;
  }>("problem");
  if (!challenge) return appError("NOT_FOUND", "Challenge not found");

  const problem = challenge.problem;
  const platform: Platform = problem.platform || "codeforces";

  const targetCPUser = await CPUser.findOne({ userId: targetUserId });

  if (platform === "codeforces") {
    if (!targetUser.codeforcesId)
      return appError("VALIDATION_ERROR", "User's CF handle not set");
    if (!targetCPUser?.cfVerified)
      return appError("VALIDATION_ERROR", "User's CF handle not verified");
  } else {
    if (!targetUser.atcoderId)
      return appError("VALIDATION_ERROR", "User's AtCoder handle not set");
    if (!targetCPUser?.acVerified)
      return appError("VALIDATION_ERROR", "User's AtCoder handle not verified");
  }

  const handle =
    platform === "codeforces" ? targetUser.codeforcesId : targetUser.atcoderId;

  let subs: unknown[] = [];
  try {
    subs = await fetchUserSubmissions(
      handle,
      platform,
      challenge.windowStart.getTime(),
    );
  } catch (err) {
    logger.warn("[forceSyncUser] API error", { err });
    return appError(
      "EXTERNAL_DEPENDENCY_FAILURE",
      `Failed to reach ${platform} API`,
    );
  }

  const dbSession = await mongoose.startSession();
  let newStatus = "Pending";
  try {
    newStatus = await auditedTransaction(dbSession, async (transaction) => {
      const currentChallenge = await DailyChallenge.findById(challengeId)
        .session(transaction)
        .populate<{ problem: WithId<POTDProblemRecord> }>("problem");
      if (!currentChallenge)
        throw new Error("POTD challenge disappeared during force sync.");
      const before = await POTDSubmission.findOne({
        userId: targetUserId,
        challengeId,
      })
        .session(transaction)
        .lean();
      const result = await syncUserChallenge(
        targetUserId,
        currentChallenge,
        subs,
        platform,
        new Date(),
        transaction,
      );
      return {
        result: result.status,
        audit: {
          actor: auditActor(session.user),
          category: "potd" as const,
          action: "sync" as const,
          operation: "potd.force_sync",
          target: {
            type: "user",
            id: targetUserId,
            label: targetUser.name || "Member",
          },
          before: summarizePOTD({
            status: before?.status,
            pointsAwarded: before?.pointsAwarded,
          }),
          after: summarizePOTD({
            status: result.status,
            pointsAwarded: result.pointsAwarded,
            force: true,
          }),
        },
      };
    });
  } finally {
    await dbSession.endSession();
  }

  logger.info("[forceSyncUser] Synced", {
    targetUserId,
    challengeId,
    newStatus,
  });
  revalidatePath("/internal/potd");

  return ok({ status: newStatus });
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

async function autoFetchPOTDCandidatesAction(
  slots: POTDAutoSlotConfig[],
  excludeProblemIds: string[] = [],
) {
  const session = await checkAdmin();
  if (!session) return appError("FORBIDDEN", "Forbidden");

  if (!Array.isArray(slots) || slots.length === 0) {
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }

  await dbConnect();

  // Get all used POTD problem IDs to avoid repeating problems
  const usedProblems = await Problem.find({});
  const usedProblemIds = new Set<string>();
  usedProblems.forEach((problem) => {
    if (problem.contestId && problem.problemIndex) {
      usedProblemIds.add(
        `${problem.contestId}${problem.problemIndex}`.toUpperCase(),
      );
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

    const matchStage: Record<string, unknown> = {
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

  return ok({ candidates });
}

async function bulkSetDailyProblemsAction(
  items: Array<{
    dateStr: string;
    difficulty: "Easy" | "Medium" | "Hard";
    problemId: string;
    platform: Platform;
  }>,
) {
  const session = await checkAdmin();
  if (!session) return appError("FORBIDDEN", "Forbidden");

  if (!Array.isArray(items) || items.length === 0) {
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }

  await dbConnect();
  const dbSession = await mongoose.startSession();
  let outcome: { count: number; errors: string[] };
  try {
    outcome = await auditedTransaction(dbSession, async (transaction) => {
      let count = 0;
      const errors: string[] = [];
      for (const item of items) {
        const res = await setDailyProblemAction(
          item.dateStr,
          item.problemId,
          item.difficulty,
          item.platform || "codeforces",
          true,
          transaction,
        );
        if (!res.ok)
          errors.push(
            `Failed to set ${item.difficulty} for ${item.dateStr}: ${res.error.message}`,
          );
        else count++;
      }
      if (count === 0)
        throw new BulkScheduleError(
          errors.join("; ") || "No POTD problems were scheduled.",
        );
      return {
        result: { count, errors },
        audit: {
          actor: auditActor(session.user),
          category: "potd" as const,
          action: "bulk_schedule" as const,
          operation: "potd.bulk_schedule",
          target: {
            type: "potd-batch",
            id: crypto.randomUUID(),
            label: `${count} scheduled POTD problems`,
          },
          after: summarizePOTD({ scheduledCount: count }),
        },
      };
    });
  } catch (error) {
    if (error instanceof BulkScheduleError)
      return appError("VALIDATION_ERROR", error.message);
    throw error;
  } finally {
    await dbSession.endSession();
  }
  const { count, errors } = outcome;

  revalidatePath("/internal/potd");

  if (errors.length > 0) {
    if (count === 0) {
      return appError("VALIDATION_ERROR", errors.join("; "));
    }
    return ok({
      count,
      error: `Saved ${count} problems. Errors: ${errors.join("; ")}`,
    });
  }

  return ok({ count, error: undefined as string | undefined });
}
