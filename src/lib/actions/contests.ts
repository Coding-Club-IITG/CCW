"use server";

import { err as appError, ok, validationError } from "@/lib/api/result";

import { defineAction } from "@/lib/actions/defineAction";

export const getContestListing = defineAction(
  "getContestListing",
  getContestListingAction,
);
export const getContestById = defineAction(
  "getContestById",
  getContestByIdAction,
);
export const registerForContest = defineAction(
  "registerForContest",
  registerForContestAction,
);
export const getAvailableTeamsForContest = defineAction(
  "getAvailableTeamsForContest",
  getAvailableTeamsForContestAction,
);
export const createRoomContest = defineAction(
  "createRoomContest",
  createRoomContestAction,
);
export const getContestRegistrations = defineAction(
  "getContestRegistrations",
  getContestRegistrationsAction,
);
export const unregisterFromContest = defineAction(
  "unregisterFromContest",
  unregisterFromContestAction,
);
export const searchVerifiedUsers = defineAction(
  "searchVerifiedUsers",
  searchVerifiedUsersAction,
);
export const createBracketContest = defineAction(
  "createBracketContest",
  createBracketContestAction,
);

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isHead } from "@/lib/access/roles";
import { webEnv } from "@/lib/env/web";

import { auth } from "@/lib/auth";
import { reconciliationQueue } from "@/lib/contests/queues";
import {
  contestCreationPayloadSchema,
  validateBracketContestInput,
  type ContestProblemSlot,
} from "@/lib/api/schemas/contestAction";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { prepareSearchQuery } from "@/lib/search";
import { auditActor } from "@/lib/audit";
import { summarizeContest } from "@/lib/audit/summary";
import AuditLog, { auditExpiry } from "@/models/AuditLog";
import ContestMatch from "@/models/ContestMatch";
import CPUser from "@/models/CPUser";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import User from "@/models/User";

export type ContestListingItem = {
  teamSize?: number;
  _id: string;
  name: string;
  description: string;
  startTime: Date | null;
  endTime?: Date | null;
  durationSeconds: number | null;
  format: string;
  mode: string;
  status: string;
  registeredCount: number;
  isRegistered: boolean;
  participantsCount: number;
  maxParticipants: number;
  registrationDeadline: Date | null;
  registrationStartTime?: Date | null;
  registrationType?: string;
  userScore?: number;
  opponentScore?: number;
  otherScores?: number[];
  result?: "victory" | "tie" | "loss";
  roomStatus?: string;
  actualStartTime?: Date | null;
};

async function getContestListingAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  await dbConnect();

  let cpUserId = null;
  if (userId) {
    const cpUser = await CPUser.findOne({ userId }).lean();
    if (cpUser) {
      cpUserId = cpUser._id.toString();
    }
  }

  const contests = await ContestMatch.find({
    status: {
      $in: ["draft", "registration", "provisioning", "active", "completed"],
    },
  }).lean();

  const active: ContestListingItem[] = [];
  const upcoming: ContestListingItem[] = [];
  const completed: ContestListingItem[] = [];

  for (const contest of contests) {
    const isRegistered = userId
      ? (contest.registrations || []).some(
          (registration) => registration.userId.toString() === userId,
        )
      : false;
    const item: ContestListingItem = {
      _id: contest._id.toString(),
      name: contest.name,
      description: contest.description || "",
      startTime: contest.startTime || null,
      endTime: contest.endTime || null,
      durationSeconds: contest.durationSeconds || null,
      format: contest.format,
      mode: contest.mode,
      status: contest.status,
      registeredCount: (contest.registrations || []).length,
      participantsCount: (contest.registrations || []).length,
      teamSize: contest.teamSize,
      isRegistered,
      registrationDeadline: contest.registrationSettings?.deadline || null,
      registrationStartTime: contest.registrationSettings?.startTime || null,
      maxParticipants: contest.registrationSettings?.maxParticipants || 999,
      registrationType: contest.registrationSettings?.type,
    };

    const status = contest.status;

    if (status === "active") {
      if (userId) {
        const room = await ContestRoom.findOne({
          contestId: contest._id,
          participants: userId,
        }).lean();
        if (room) {
          item.roomStatus = room.status;
          item.actualStartTime = room.actualStartTime || null;
        }
      }
      active.push(item);
    } else if (["registration", "draft", "provisioning"].includes(status)) {
      upcoming.push(item);
    } else if (status === "completed") {
      if (userId) {
        const room = await ContestRoom.findOne({
          contestId: contest._id,
          participants: userId,
        }).lean();
        if (room) {
          const teams = await ContestTeam.find({ roomId: room._id }).lean();
          const userTeam = teams.find((team) =>
            team.members.some((memberId) => memberId.toString() === userId),
          );
          if (userTeam) {
            item.userScore = userTeam.score;
            const otherTeams = teams.filter(
              (team) => team._id.toString() !== userTeam._id.toString(),
            );
            item.opponentScore =
              otherTeams.length > 0
                ? Math.max(...otherTeams.map((team) => team.score))
                : 0;
            item.otherScores = otherTeams
              .map((team) => team.score)
              .sort((a: number, b: number) => b - a);
            const us = item.userScore ?? 0;
            const op = item.opponentScore ?? 0;
            item.result = us > op ? "victory" : us === op ? "tie" : "loss";
          }
        }
      }
      // Always add completed contests so any user can view results
      completed.push(item);
    }
  }

  // Sort
  active.sort((a, b) =>
    a.startTime && b.startTime
      ? a.startTime.getTime() - b.startTime.getTime()
      : 0,
  );
  upcoming.sort((a, b) =>
    a.startTime && b.startTime
      ? a.startTime.getTime() - b.startTime.getTime()
      : 0,
  );
  completed.sort((a, b) =>
    a.startTime && b.startTime
      ? b.startTime.getTime() - a.startTime.getTime()
      : 0,
  ); // desc

  return ok({ active, upcoming, completed });
}

async function getContestByIdAction(id: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  await dbConnect();

  let cpUserId = null;
  if (userId) {
    const cpUser = await CPUser.findOne({ userId }).lean();
    if (cpUser) {
      cpUserId = cpUser._id.toString();
    }
  }

  try {
    const contest = await ContestMatch.findById(id).lean();
    if (!contest) return appError("NOT_FOUND", "Contest not found");

    const isRegistered = userId
      ? (contest.registrations || []).some(
          (registration) => registration.userId.toString() === userId,
        )
      : false;

    let computedStatus = contest.status;
    const now = new Date();
    if (
      ["completed", "active", "draft", "provisioning"].includes(contest.status)
    ) {
      computedStatus = contest.status;
    } else if (contest.startTime && contest.endTime) {
      if (now >= contest.startTime && now <= contest.endTime) {
        computedStatus = "active";
      } else if (now > contest.endTime) {
        computedStatus = "completed";
      } else if (now < contest.startTime) {
        computedStatus = "registration";
      }
    }

    return ok({
      _id: contest._id.toString(),
      name: contest.name,
      description: contest.description || "",
      startTime: contest.startTime || null,
      endTime: contest.endTime || null,
      durationSeconds: contest.durationSeconds || null,
      format: contest.format,
      mode: contest.mode,
      status: computedStatus,
      registeredCount: (contest.registrations || []).length,
      participantsCount: (contest.registrations || []).length,
      teamSize: contest.teamSize,
      isRegistered,
      registrationDeadline: contest.registrationSettings?.deadline || null,
      maxParticipants: contest.registrationSettings?.maxParticipants || 999,
      registrationType: contest.registrationSettings?.type,
    });
  } catch (error) {
    logger.error("Contest lookup failed", {
      action: "getContestById",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function registerForContestAction(contestId: string, teamName?: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await dbConnect();
    const cpUser = await CPUser.findOne({ userId });
    if (!cpUser) return appError("NOT_FOUND", "CP Profile not found");

    const contest = await ContestMatch.findById(contestId);
    if (!contest) return appError("NOT_FOUND", "Contest not found");

    if (contest.status !== "registration") {
      return appError(
        "VALIDATION_ERROR",
        "Contest is not open for registration",
      );
    }

    const isAlreadyRegistered = contest.registrations?.some(
      (registration) => registration.userId.toString() === userId,
    );
    if (isAlreadyRegistered) {
      return appError("CONFLICT", "Already registered");
    }

    if (!contest.registrations) contest.registrations = [];

    const tName = teamName || cpUser.cfHandle || "unknown";

    const teamSize = contest.teamSize ?? 1;
    if (teamSize > 1) {
      const teamMembers = contest.registrations.filter(
        (registration) => registration.teamName === tName,
      );
      if (teamMembers.length >= teamSize) {
        return appError("CONFLICT", "Team is already full.");
      }
    } else {
      // For solo, ensure no duplicate team name
      const teamExists = contest.registrations.some(
        (registration) => registration.teamName === tName,
      );
      if (teamExists) {
        return appError("CONFLICT", "Display name already taken.");
      }
    }

    contest.registrations.push({
      userId: cpUser.userId,
      cfHandle: cpUser.cfHandle || "unknown",
      teamName: tName,
      registeredAt: new Date(),
    });

    await contest.save();

    // Revalidate the contests listing page
    revalidatePath("/internal/contests");
    return ok({ message: "Successfully registered" });
  } catch (error) {
    logger.error("Contest registration failed", {
      action: "registerForContest",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function getAvailableTeamsForContestAction(contestId: string) {
  try {
    await dbConnect();
    const contest = await ContestMatch.findById(contestId).lean();
    const teamSize = contest?.teamSize ?? 1;
    if (!contest || teamSize <= 1) return ok([]);

    const registrations = contest.registrations || [];
    const teamCounts: Record<string, number> = {};

    for (const reg of registrations) {
      if (reg.teamName) {
        teamCounts[reg.teamName] = (teamCounts[reg.teamName] || 0) + 1;
      }
    }

    const availableTeams = Object.entries(teamCounts)
      .filter(([_, count]) => count < teamSize)
      .map(([teamName, count]) => ({
        teamName,
        memberCount: count,
        maxCapacity: teamSize,
      }));

    return ok(availableTeams);
  } catch (error) {
    logger.error("Available contest teams lookup failed", {
      action: "getAvailableTeams",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function createRoomContestAction(input: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    const parsed = contestCreationPayloadSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const data = parsed.data;

    await dbConnect();
    const cpUser = await CPUser.findOne({ userId });
    if (!cpUser) return appError("NOT_FOUND", "CP Profile not found");

    const userRole = session.user.access;
    const isHeadUser = isHead(userRole);
    if (!isHeadUser) {
      if (data.format !== "1v1" || data.registrationType === "open") {
        return appError(
          "FORBIDDEN",
          "Only heads and admins can create tournaments or open contests.",
        );
      }
      data.teamSize = 1;
      data.maxParticipants = 2;
      data.registrationType = "closed";
    }

    const start = new Date(data.startTime);
    const deadlineMinutes = webEnv.REGISTRATION_DEADLINE_MINUTES;
    const isCasual1v1 =
      data.format === "1v1" && data.registrationType === "closed";
    const minBufferMinutes = isCasual1v1 ? 1 : deadlineMinutes + 1;

    if (start.getTime() < Date.now() + minBufferMinutes * 60000 - 5000) {
      // 5s grace period
      return appError(
        "VALIDATION_ERROR",
        `Start time must be strictly at least ${minBufferMinutes} minute${minBufferMinutes > 1 ? "s" : ""} ahead of current time`,
      );
    }

    const deadline = isCasual1v1
      ? start
      : new Date(start.getTime() - deadlineMinutes * 60000);

    // Format-specific backend validations and overrides
    let { maxParticipants, teamSize, format } = data;

    if (format === "1v1") {
      teamSize = 1;
      maxParticipants = 2;
    } else if (format === "solo-tournament") {
      teamSize = 1;
      if (maxParticipants < 2)
        return appError(
          "VALIDATION_ERROR",
          "At least 2 participants required.",
        );
    } else if (format === "team-tournament") {
      teamSize = 3;
      if (maxParticipants < 6)
        return appError(
          "VALIDATION_ERROR",
          "Team battles require at least 6 participants.",
        );
      maxParticipants = maxParticipants - (maxParticipants % 3);
    }

    let problemSlots: ContestProblemSlot[] = [];
    if (data.problemSelectionMode === "fine-tuned") {
      if (Array.isArray(data.problemSlots) && data.problemSlots.length > 0) {
        problemSlots = data.problemSlots;
      } else if (Array.isArray(data.fineTunedProblems)) {
        problemSlots = data.fineTunedProblems.map((id: string) => ({
          platform: "codeforces",
          problemId: id.trim(),
          points: 100,
        }));
      }
    }

    const contest = new ContestMatch({
      name: data.name,
      description: data.description,
      creatorId: cpUser._id,
      startTime: start,
      format: format,
      mode: data.mode || "blitz",
      status: "draft",
      teamSize: teamSize,
      problemSelectionMode: data.problemSelectionMode,
      bulkPlatform: "codeforces",
      bulkRatingMin: data.bulkRatingMin,
      bulkRatingMax: data.bulkRatingMax,
      bulkProblemCount: data.bulkProblemCount,
      problemSlots: problemSlots.length > 0 ? problemSlots : undefined,
      overallDurationMinutes: data.overallDurationMinutes,
      perProblemDurationMinutes: data.perProblemDurationMinutes,
      bracketSettings:
        format === "bracket"
          ? {
              type: data.bracketType || "single_elimination",
              thirdPlacePlayoff: data.thirdPlacePlayoff,
              seedingMethod: data.seedingMethod,
            }
          : undefined,
      registrationSettings: {
        type: data.registrationType || "open",
        startTime: data.registrationStartTime
          ? new Date(data.registrationStartTime)
          : undefined,
        deadline: deadline,
        maxParticipants: maxParticipants,
      },
      registrations: data.registeredUsers.map((user) => ({
        userId: new mongoose.Types.ObjectId(user.id),
        cfHandle: user.cfHandle,
        teamName: user.teamName,
        registeredAt: new Date(),
      })),
    });

    await contest.save();

    if (isHeadUser && format !== "1v1") {
      const auditNow = new Date();
      await AuditLog.create({
        actor: auditActor(session.user),
        category: "contests",
        action: "create",
        operation: "contests.room.create",
        target: {
          type: "contest",
          id: String(contest._id),
          label: contest.name,
        },
        before: {},
        after: summarizeContest(
          contest.toObject() as unknown as Record<string, unknown>,
        ),
        createdAt: auditNow,
        expiresAt: auditExpiry(auditNow),
      });
    }

    // Handle scheduling based on registrationStartTime and deadline
    const now = Date.now();
    const regStartTime = data.registrationStartTime
      ? new Date(data.registrationStartTime).getTime()
      : now;
    const deadlineTime = contest.registrationSettings!.deadline!.getTime();

    // Validate registration starts before it ends (only for open registration)
    if (data.registrationType !== "closed" && regStartTime >= deadlineTime) {
      await ContestMatch.findByIdAndDelete(contest._id);
      return appError(
        "VALIDATION_ERROR",
        "Registration start time must be before the deadline.",
      );
    }

    if (data.registrationType !== "closed") {
      // If registration is in the future, schedule start_registration
      if (regStartTime > now) {
        await reconciliationQueue.add(
          "start_registration",
          { contestId: contest._id.toString() },
          { delay: regStartTime - now },
        );
      } else {
        contest.status = "registration";
        await contest.save();
      }

      // Schedule the check_start job at the registration deadline
      const delay = Math.max(0, deadlineTime - Date.now());
      await reconciliationQueue.add(
        "check_start",
        { contestId: contest._id.toString() },
        { delay },
      );
    } else {
      // For closed matches, directly invoke check_start job immediately
      await reconciliationQueue.add(
        "check_start",
        { contestId: contest._id.toString() },
        { delay: 0 },
      );
    }

    revalidatePath("/internal/contests");
    return ok({});
  } catch (err: unknown) {
    logger.error("Contest room creation failed", {
      action: "createRoomContest",
      ...errorToLogMetadata(err),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function getContestRegistrationsAction(contestId: string) {
  try {
    await dbConnect();
    const contest = await ContestMatch.findById(contestId).lean();
    if (!contest) return appError("NOT_FOUND", "Contest not found");

    const User = (await import("@/models/User")).default;
    const userIds = (contest.registrations || []).map(
      (registration) => registration.userId,
    );
    const users = await User.find({ _id: { $in: userIds } }, "image").lean();
    const imageMap: Record<string, string> = {};
    users.forEach((user) => {
      if (user.image) imageMap[user._id.toString()] = user.image;
    });

    const populatedRegistrations = (contest.registrations || []).map(
      (registration) => ({
        userId: registration.userId.toString(),
        cfHandle: registration.cfHandle ?? "",
        teamName: registration.teamName ?? "",
        registeredAt: registration.registeredAt
          ? new Date(registration.registeredAt).toISOString()
          : null,
        image: imageMap[registration.userId.toString()] || null,
      }),
    );

    const isDeadlinePassed = contest.registrationSettings?.deadline
      ? new Date() > new Date(contest.registrationSettings.deadline)
      : false;

    return ok({
      format: contest.format,
      teamSize: contest.teamSize,
      registrationType: contest.registrationSettings?.type,
      isDeadlinePassed,
      registrations: populatedRegistrations,
    });
  } catch (error) {
    logger.error("Contest registrations lookup failed", {
      action: "getContestRegistrations",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function unregisterFromContestAction(contestId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await dbConnect();

    const contest = await ContestMatch.findById(contestId);
    if (!contest) return appError("NOT_FOUND", "Contest not found");

    if (contest.status !== "registration") {
      return appError(
        "VALIDATION_ERROR",
        "Cannot unregister after registration has closed.",
      );
    }

    if (!contest.registrations) return appError("NOT_FOUND", "Not registered");

    const initialLength = contest.registrations.length;
    contest.registrations = contest.registrations.filter(
      (registration) => registration.userId.toString() !== userId,
    );

    if (contest.registrations.length === initialLength) {
      return appError("NOT_FOUND", "Not registered");
    }

    await contest.save();

    revalidatePath("/internal/contests");
    return ok({ message: "Successfully unregistered" });
  } catch (error) {
    logger.error("Contest unregistration failed", {
      action: "unregisterFromContest",
      ...errorToLogMetadata(error),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function searchVerifiedUsersAction(query: string) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return appError("UNAUTHENTICATED", "Unauthorized");

  if (!query || query.length < 2) return ok({ users: [] });

  await dbConnect();

  const search = prepareSearchQuery(query);
  if (!search) return ok({ users: [] });

  const users = await User.find({
    name: { $regex: search.pattern, $options: "i" },
  })
    .select("_id name image pizza_count")
    .limit(20)
    .lean();

  if (users.length === 0) return ok({ users: [] });

  const userIds = users.map((user) => user._id);

  // Find which of these users are CPUsers with verified handles
  const cpUsers = await CPUser.find({
    userId: { $in: userIds },
    cfHandle: { $ne: "" },
  })
    .select("userId cfHandle cfRating")
    .lean();

  const cpUserMap = new Map<string, { cfHandle: string; cfRating: number }>();
  for (const c of cpUsers) {
    cpUserMap.set(c.userId.toString(), {
      cfHandle: c.cfHandle,
      cfRating: c.cfRating,
    });
  }

  const result = users
    .filter((user) => cpUserMap.has(user._id.toString()))
    .map((user) => {
      const cpData = cpUserMap.get(user._id.toString())!;
      return {
        id: user._id.toString(),
        name: user.name ?? "",
        image: user.image,
        pizza_count: user.pizza_count || 0,
        cfHandle: cpData.cfHandle,
        cfRating: cpData.cfRating || 0,
      };
    });

  return ok({ users: result });
}

// ─── Bracket / Knockout creation for all authenticated users ──────────────────

async function createBracketContestAction(input: unknown) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return appError("UNAUTHENTICATED", "Unauthorized");
  if (!isHead(session.user.access)) return appError("FORBIDDEN", "Forbidden");

  const parsed = contestCreationPayloadSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  await dbConnect();

  // ── Server-side validation ──────────────────────────────────────────────────
  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    return appError("VALIDATION_ERROR", "Contest name is required.");
  }
  if (data.name.trim().length > 100) {
    return appError(
      "VALIDATION_ERROR",
      "Contest name must be 100 characters or fewer.",
    );
  }
  if (!data.mode || !["blitz", "arena"].includes(data.mode)) {
    return appError(
      "VALIDATION_ERROR",
      "Mode must be either 'blitz' or 'arena'.",
    );
  }
  if (!data.startTime || isNaN(new Date(data.startTime).getTime())) {
    return appError("VALIDATION_ERROR", "A valid start time is required.");
  }
  const _deadlineMinutes = webEnv.REGISTRATION_DEADLINE_MINUTES;
  const _startMs = new Date(data.startTime).getTime();
  const _minStart = Date.now() + (_deadlineMinutes + 1) * 60000;
  if (_startMs < _minStart) {
    return appError(
      "VALIDATION_ERROR",
      `Start time must be at least ${_deadlineMinutes + 1} minutes in the future.`,
    );
  }
  const bracketInputValidation = validateBracketContestInput(data);
  if (!bracketInputValidation.success) {
    return appError("VALIDATION_ERROR", bracketInputValidation.error);
  }
  if (
    data.registrationStartTime &&
    isNaN(new Date(data.registrationStartTime).getTime())
  ) {
    return appError(
      "VALIDATION_ERROR",
      "Registration start time must be a valid date.",
    );
  }
  const registrationDeadlineMs = _startMs - _deadlineMinutes * 60_000;
  if (data.registrationType === "open" && data.registrationStartTime) {
    const registrationStartMs = new Date(data.registrationStartTime).getTime();
    if (registrationStartMs <= Date.now()) {
      return appError(
        "VALIDATION_ERROR",
        "Scheduled registration must start in the future.",
      );
    }
    if (registrationStartMs >= registrationDeadlineMs) {
      return appError(
        "VALIDATION_ERROR",
        "Registration start time must be before the deadline.",
      );
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  let presetId = undefined;
  let problemSelectionMode = data.problemSelectionMode;
  let bulkPlatform = data.bulkPlatform || "codeforces";
  let bulkRatingMin = data.bulkRatingMin;
  let bulkRatingMax = data.bulkRatingMax;
  let bulkProblemCount = data.bulkProblemCount;
  let bulkMinContestId = data.bulkMinContestId ?? 0;
  let problemSlots: ContestProblemSlot[] = [];

  if (data.presetId && data.presetId !== "custom") {
    const ContestPreset = (await import("@/models/ContestPreset")).default;
    const preset = await ContestPreset.findById(data.presetId);
    if (!preset) return appError("NOT_FOUND", "Selected preset does not exist");
    if (preset.archived)
      return appError("INTERNAL_ERROR", "An unexpected error occurred.");
    presetId = preset._id;
    problemSelectionMode = preset.problemSelectionMode ?? "bulk";
    bulkPlatform = preset.bulkPlatform ?? "codeforces";
    bulkRatingMin = preset.bulkRatingMin;
    bulkRatingMax = preset.bulkRatingMax;
    bulkProblemCount = data.bulkProblemCount || preset.bulkProblemCount;
    bulkMinContestId = data.bulkMinContestId ?? preset.bulkMinContestId ?? 0;
    problemSlots =
      data.problemSlots.length > 0
        ? data.problemSlots
        : (preset.problemSlots ?? [])
            .filter(
              (slot): slot is typeof slot & { problemId: string } =>
                typeof slot.problemId === "string" &&
                slot.problemId.trim().length > 0,
            )
            .map((slot) => ({
              platform: slot.platform,
              problemId: slot.problemId,
              roundNumber: slot.roundNumber,
            }));
  } else {
    // custom - validate bulk / fine-tuned fields
    if (
      !problemSelectionMode ||
      !["bulk", "fine-tuned"].includes(problemSelectionMode)
    ) {
      return appError(
        "VALIDATION_ERROR",
        "Problem selection mode must be 'bulk' or 'fine-tuned'.",
      );
    }
    if (problemSelectionMode === "bulk") {
      const rMin = Number(bulkRatingMin);
      const rMax = Number(bulkRatingMax);
      const rCount = Number(bulkProblemCount);
      if (isNaN(rMin) || isNaN(rMax) || rMin < 800 || rMax > 3500) {
        return appError(
          "VALIDATION_ERROR",
          "Rating range must be between 800 and 3500.",
        );
      }
      if (rMin >= rMax) {
        return appError(
          "VALIDATION_ERROR",
          "Minimum rating must be less than maximum rating.",
        );
      }
      if (isNaN(rCount) || rCount < 1 || rCount > 20) {
        return appError(
          "VALIDATION_ERROR",
          "Problem count must be between 1 and 20.",
        );
      }
    }
    if (problemSelectionMode === "fine-tuned") {
      if (!Array.isArray(data.problemSlots) || data.problemSlots.length === 0) {
        return appError(
          "VALIDATION_ERROR",
          "Fine-tuned problem slots with round assignments are required for a bracket contest.",
        );
      }
      problemSlots = data.problemSlots.filter(
        (slot) => slot.problemId.trim() !== "",
      );
      if (problemSlots.length === 0) {
        return appError("INTERNAL_ERROR", "An unexpected error occurred.");
      }
    }
  }

  const verifiedRegistrations: {
    userId: mongoose.Types.ObjectId;
    cfHandle: string;
    teamName?: string;
    registeredAt: Date;
  }[] = [];

  // Validate registered user CP-profile eligibility and persist canonical handles.
  if (Array.isArray(data.registeredUsers) && data.registeredUsers.length > 0) {
    for (const u of data.registeredUsers) {
      if (!u.id || !mongoose.Types.ObjectId.isValid(u.id)) {
        return appError("VALIDATION_ERROR", `Invalid user ID: ${u.id}`);
      }
      const cp = await CPUser.findOne({
        userId: new mongoose.Types.ObjectId(u.id),
      });
      if (!cp) {
        return appError("INTERNAL_ERROR", "An unexpected error occurred.");
      }
      if (!cp.cfHandle) {
        return appError("INTERNAL_ERROR", "An unexpected error occurred.");
      }
      verifiedRegistrations.push({
        userId: new mongoose.Types.ObjectId(u.id),
        cfHandle: cp.cfHandle,
        teamName: u.teamName?.trim() || undefined,
        registeredAt: new Date(),
      });
    }
  }

  try {
    const cpUser = await CPUser.findOne({ userId: session.user.id });
    if (!cpUser) return appError("NOT_FOUND", "CP Profile not found");

    const deadlineMinutes = webEnv.REGISTRATION_DEADLINE_MINUTES;

    const contest = await ContestMatch.create({
      name: data.name.trim(),
      description: data.description?.trim(),
      creatorId: cpUser._id,
      format: "bracket",
      mode: data.mode,
      status: "draft",
      teamSize: data.teamSize,
      presetId: presetId,
      problemSelectionMode: problemSelectionMode,
      bulkPlatform: bulkPlatform,
      bulkRatingMin: bulkRatingMin,
      bulkRatingMax: bulkRatingMax,
      bulkProblemCount: bulkProblemCount,
      bulkMinContestId: bulkMinContestId || undefined,
      problemSlots: problemSlots,
      registrations: verifiedRegistrations,
      startTime: new Date(data.startTime),
      registrationSettings: {
        type: data.registrationType,
        startTime: data.registrationStartTime
          ? new Date(data.registrationStartTime)
          : undefined,
        deadline: new Date(
          new Date(data.startTime).getTime() - deadlineMinutes * 60000,
        ),
        maxParticipants: Number(data.maxParticipants),
      },
      overallDurationMinutes: data.overallDurationMinutes,
      perProblemDurationMinutes: data.perProblemDurationMinutes,
      bracketSettings: {
        type: data.bracketType || "single_elimination",
        thirdPlacePlayoff: !!data.thirdPlacePlayoff,
        seedingMethod: data.seedingMethod || "cf_rating",
      },
    });

    const auditNow = new Date();
    await AuditLog.create({
      actor: auditActor(session.user),
      category: "contests",
      action: "create",
      operation: "contests.tournament.create",
      target: {
        type: "contest",
        id: String(contest._id),
        label: contest.name,
      },
      before: {},
      after: summarizeContest(
        contest.toObject() as unknown as Record<string, unknown>,
      ),
      createdAt: auditNow,
      expiresAt: auditExpiry(auditNow),
    });

    const now = Date.now();
    const regStartTime = data.registrationStartTime
      ? new Date(data.registrationStartTime).getTime()
      : now;
    const deadlineTime = contest.registrationSettings!.deadline!.getTime();

    if (data.registrationType !== "closed") {
      if (regStartTime > now) {
        await reconciliationQueue.add(
          "start_registration",
          { contestId: contest._id.toString() },
          { delay: regStartTime - now },
        );
      } else {
        contest.status = "registration";
        await contest.save();
      }
    } else {
      contest.status = "provisioning";
      await contest.save();
      await reconciliationQueue.add("check_start", {
        contestId: contest._id.toString(),
      });
    }

    if (data.registrationType !== "closed" && deadlineTime > now) {
      await reconciliationQueue.add(
        "check_start",
        { contestId: contest._id.toString() },
        { delay: deadlineTime - now },
      );
    }

    revalidatePath("/internal/contests");
    return ok({ contestId: contest._id.toString() });
  } catch (err: unknown) {
    logger.error("[createBracketContest] Failed to create bracket contest", {
      err,
      userId: session.user.id,
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}
