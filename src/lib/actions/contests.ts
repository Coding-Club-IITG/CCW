"use server";

import mongoose from "mongoose";
import { problemAllocationError } from "@/lib/contests/problemAllocation";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { err as appError, ok, validationError } from "@/lib/api/result";
import { defineAction } from "@/lib/actions/defineAction";
import { canSpectateContest } from "@/lib/access/contests";
import { isHead } from "@/lib/access/roles";
import {
  contestRegistrationTiming,
  contestStartTimeError,
} from "@/lib/contests/registrationTiming";
import { webEnv } from "@/lib/env/web";
import { auth } from "@/lib/auth/server";
import { reconciliationQueue } from "@/lib/contests/queues";
import {
  contestCreationPayloadSchema,
  contestCreationDraftSchema,
  validateBracketContestInput,
  type ContestProblemSlot,
} from "@/lib/api/schemas/contestAction";
import { connectMongoDB } from "@/lib/db/mongodb";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";
import { prepareSearchQuery } from "@/lib/shared/search";
import { auditActor } from "@/lib/audit/index";
import { summarizeContest } from "@/lib/audit/summary";
import {
  contestRegistrationIdSchema,
  contestRegistrationSchema,
  contestTeamInviteSchema,
  contestTeamTargetSchema,
  contestTeamResponseSchema,
} from "@/lib/api/schemas/contestRegistration";
import {
  registerContestMember,
  leaveContest,
  sendContestTeamRequest,
  respondToTeamRequest,
  prepareContestRegistrations,
} from "@/lib/contests/registration";
import {
  toContestTeamRequestDto,
  type ContestAvailableTeamDto,
} from "@/lib/contests/dtos";

import AuditLog, { auditExpiry } from "@/models/AuditLog";
import ContestMatch from "@/models/ContestMatch";
import ContestPreset from "@/models/ContestPreset";
import CPUser from "@/models/CPUser";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import User from "@/models/User";
import ContestRegistrationTeam from "@/models/ContestRegistrationTeam";
import ContestTeamRequest from "@/models/ContestTeamRequest";

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
export const respondToContestTeamRequest = defineAction(
  "respondToContestTeamRequest",
  respondToContestTeamRequestAction,
);
export const requestToJoinContestTeam = defineAction(
  "requestToJoinContestTeam",
  requestToJoinContestTeamAction,
);
export const inviteToContestTeam = defineAction(
  "inviteToContestTeam",
  inviteToContestTeamAction,
);
export const getContestTeamRequests = defineAction(
  "getContestTeamRequests",
  getContestTeamRequestsAction,
);
export const getMyContestInvites = defineAction(
  "getMyContestInvites",
  getMyContestInvitesAction,
);
export const getMyTeamJoinRequests = defineAction(
  "getMyTeamJoinRequests",
  getMyTeamJoinRequestsAction,
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
export const validateStep = defineAction("validateStep", validateStepAction);

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
  registeredTeamId?: string;
  registeredTeamName?: string;
  isTeamLeader?: boolean;
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
  canSpectate?: boolean;
  creatorId?: string;
  spectatorRestriction?: string;
  bracketSettings?: {
    type?: "single_elimination" | "double_elimination";
  };
};

async function getContestListingAction() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  await connectMongoDB();

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
    const canSpectate = canSpectateContest(
      contest,
      session?.user,
      cpUserId ?? undefined,
    );

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
      creatorId: contest.creatorId?.toString(),
      spectatorRestriction: (contest as any).spectatorRestriction || "none",
      canSpectate,
      bracketSettings: contest.bracketSettings
        ? {
            type: contest.bracketSettings.type,
          }
        : undefined,
    };

    if (isRegistered && contest.teamSize && contest.teamSize > 1) {
      const userReg = (contest.registrations || []).find(
        (r) => r.userId.toString() === userId,
      );

      if (userReg) {
        item.registeredTeamName = userReg.teamName;

        const regTeam = await ContestRegistrationTeam.findOne({
          contestId: contest._id,
          name: userReg.teamName,
        }).lean();

        if (regTeam) {
          item.registeredTeamId = regTeam._id.toString();
          item.isTeamLeader = regTeam.leaderId === userId;
        }
      }
    }

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
        })
          .sort({ actualStartTime: -1, createdAt: -1 })
          .lean();

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

            item.result = room.winnerTeamId
              ? String(room.winnerTeamId) === String(userTeam._id)
                ? "victory"
                : "loss"
              : room.resultMethod === "draw"
                ? "tie"
                : "loss";
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

  await connectMongoDB();

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
      creatorId: contest.creatorId?.toString(),
      spectatorRestriction: (contest as any).spectatorRestriction || "none",
    });
  } catch (error) {
    logger.error("Contest lookup failed", {
      action: "getContestById",
      ...errorToLogMetadata(error),
    });

    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}

async function registerForContestAction(
  contestId: string,
  teamName?: string,
  isPublic?: boolean,
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) return appError("UNAUTHENTICATED", "Unauthorized");

  const parsed = contestRegistrationSchema.safeParse({
    contestId,
    teamName,
    isPublic,
  });

  if (!parsed.success) return validationError(parsed.error);

  const result = await registerContestMember(session.user.id, parsed.data);

  if (result.ok) revalidatePath("/internal/contests");

  return result;
}

async function getAvailableTeamsForContestAction(contestId: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) return appError("UNAUTHENTICATED", "Unauthorized");

  const parsed = contestRegistrationIdSchema.safeParse(contestId);

  if (!parsed.success) return validationError(parsed.error);

  await connectMongoDB();

  const contest = await ContestMatch.findById(parsed.data).lean();

  if (!contest) return appError("NOT_FOUND", "Contest not found");

  const teamSize = contest.teamSize ?? 1;

  if (teamSize <= 1) return ok<ContestAvailableTeamDto[]>([]);

  const teams = await ContestRegistrationTeam.find({
    contestId: contest._id,
  }).lean();
  const available: ContestAvailableTeamDto[] = [];

  for (const team of teams) {
    const members = (contest.registrations ?? []).filter(
      (r) => r.teamName === team.name,
    );

    if (members.length && members.length < teamSize)
      available.push({
        teamId: String(team._id),
        teamName: team.name,
        memberCount: members.length,
        maxCapacity: teamSize,
        isPublic: team.isPublic,
        leaderId: team.leaderId,
      });
  }

  return ok(available);
}

async function createRoomContestAction(input: unknown) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    const parsed = contestCreationPayloadSchema.safeParse(input);

    if (!parsed.success) return validationError(parsed.error);

    const data = parsed.data;

    if (
      process.env.NODE_ENV === "production" &&
      data.problemSelectionMode === "test"
    ) {
      return appError(
        "VALIDATION_ERROR",
        "Problem selection mode must be 'bulk' or 'fine-tuned'.",
      );
    }

    await connectMongoDB();

    const cpUser = await CPUser.findOne({ userId });

    if (!cpUser) return appError("NOT_FOUND", "CP Profile not found");

    const userRole = session.user.access;
    const isHeadUser = isHead(userRole);

    if (!isHeadUser) {
      if (data.format === "bracket" && (data.entrantCapacity ?? 0) > 8) {
        return appError(
          "FORBIDDEN",
          "Non-admin users cannot create a knockout tournament with more than 8 entrants.",
        );
      }
    }

    const start = new Date(data.startTime);
    const deadlineMinutes = webEnv.REGISTRATION_DEADLINE_MINUTES;
    const isCasual1v1 =
      data.format === "1v1" && data.registrationType === "closed";
    const startError = contestStartTimeError(
      data.startTime,
      isCasual1v1,
      contestRegistrationTiming(webEnv),
    );

    if (startError) return appError("VALIDATION_ERROR", startError);

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

    if (format === "bracket") {
      const validation = validateBracketContestInput(data);

      if (!validation.success)
        return appError("VALIDATION_ERROR", validation.error);
    }

    const registrations = await prepareContestRegistrations({
      ...data,
      teamSize,
      maxParticipants,
    });

    if (!registrations.ok) return registrations;

    let problemSlots: ContestProblemSlot[] = [];
    let durationSeconds: number | undefined;

    if (data.presetId && data.presetId !== "custom") {
      const ContestPreset = (await import("@/models/ContestPreset")).default;
      const preset = await ContestPreset.findById(data.presetId);

      if (preset && preset.durationSeconds) {
        durationSeconds = preset.durationSeconds;
      }
    }

    if (data.problemSelectionMode === "fine-tuned") {
      if (Array.isArray(data.problemSlots) && data.problemSlots.length > 0) {
        problemSlots = data.problemSlots;
      } else {
        return appError(
          "VALIDATION_ERROR",
          "Problem slots are required for fine-tuned mode.",
        );
      }

      for (let i = 0; i < problemSlots.length; i++) {
        const slot = problemSlots[i];

        if (
          slot.points === undefined ||
          slot.points === null ||
          typeof slot.points !== "number" ||
          Number.isNaN(slot.points)
        ) {
          return appError(
            "VALIDATION_ERROR",
            `Problem ${i + 1} (${slot.problemId}): points are mandatory in fine-tuned mode.`,
          );
        }

        if (slot.points < 80) {
          return appError(
            "VALIDATION_ERROR",
            `Problem ${i + 1} (${slot.problemId}): points must be at least 80.`,
          );
        }
      }
    }

    const allocationError = problemAllocationError({ ...data, problemSlots });

    if (allocationError) return appError("VALIDATION_ERROR", allocationError);

    // Handle scheduling based on registrationStartTime and deadline
    const now = Date.now();
    const regStartTime = data.registrationStartTime
      ? new Date(data.registrationStartTime).getTime()
      : now;
    const deadlineTime = deadline.getTime();

    // Validate registration starts before it ends (only for open registration)
    if (data.registrationType !== "closed" && regStartTime >= deadlineTime) {
      return appError(
        "VALIDATION_ERROR",
        "Registration start time must be before the deadline.",
      );
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
      spectatorRestriction: data.spectatorRestriction,
      durationSeconds: durationSeconds,
      problemSelectionMode: data.problemSelectionMode,
      bulkPlatform: "codeforces",
      bulkRatingMin: data.bulkRatingMin,
      bulkRatingMax: data.bulkRatingMax,
      bulkMinContestId: data.bulkMinContestId,
      bulkProblemCount: data.bulkProblemCount,
      problemSlots: problemSlots.length > 0 ? problemSlots : undefined,
      overallDurationMinutes:
        data.overallDurationMinutes ??
        (durationSeconds
          ? durationSeconds / 60
          : webEnv.CONTEST_DEFAULT_MATCH_MINUTES),
      perProblemDurationMinutes: data.perProblemDurationMinutes,
      bracketSettings:
        format === "bracket"
          ? {
              type: data.bracketType || "single_elimination",
            }
          : undefined,
      registrationSettings: {
        type: data.registrationType || "open",
        startTime: data.registrationStartTime
          ? new Date(data.registrationStartTime)
          : undefined,
        deadline: deadline,
        maxParticipants: maxParticipants,
        entrantCapacity:
          format === "bracket" ? data.entrantCapacity : undefined,
      },
      registrations: registrations.data,
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
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user?.id) return appError("UNAUTHENTICATED", "Unauthorized");

    const parsed = contestRegistrationIdSchema.safeParse(contestId);

    if (!parsed.success) return validationError(parsed.error);

    await connectMongoDB();

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
        image: imageMap[registration.userId.toString()] ?? null,
        teamName: registration.teamName ?? registration.cfHandle,
        registeredAt: registration.registeredAt?.toISOString() ?? null,
      }),
    );

    const isDeadlinePassed = contest.registrationSettings?.deadline
      ? new Date() >= new Date(contest.registrationSettings.deadline)
      : false;

    return ok({
      format: contest.format,
      teamSize: contest.teamSize,
      registrationType: contest.registrationSettings?.type,
      creatorId: contest.creatorId?.toString(),
      spectatorRestriction: (contest as any).spectatorRestriction || "none",
      isDeadlinePassed,
      registrations: populatedRegistrations,
    });
  } catch (error) {
    logger.error("Contest registrations lookup failed", {
      action: "getContestRegistrations",
      ...errorToLogMetadata(error),
    });

    return appError("INTERNAL_ERROR", "Failed to fetch registrations");
  }
}

async function unregisterFromContestAction(contestId: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) return appError("UNAUTHENTICATED", "Unauthorized");

  const parsed = contestRegistrationIdSchema.safeParse(contestId);

  if (!parsed.success) return validationError(parsed.error);

  const result = await leaveContest(session.user.id, parsed.data);

  if (result.ok) revalidatePath("/internal/contests");

  return result;
}

async function searchVerifiedUsersAction(query: string) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) return appError("UNAUTHENTICATED", "Unauthorized");

  if (!query || query.length < 2) return ok({ users: [] });

  await connectMongoDB();

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

// Bracket / Knockout creation for all authenticated users

async function validateStepAction(step: number, input: unknown) {
  const parsed = contestCreationDraftSchema.safeParse(input);

  if (!parsed.success) return validationError(parsed.error);

  const data = parsed.data;
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (data.mode !== "blitz" && data.mode !== "arena") {
      errors.mode = "Mode must be blitz or arena";
    }

    if (data.teamSize !== 1 && data.teamSize !== 3) {
      errors.teamSize = "Team size must be 1 or 3";
    }
  }

  if (step === 2) {
    if (
      !data.startTime ||
      !Number.isFinite(new Date(data.startTime).getTime())
    ) {
      errors.startTime = "A valid tournament start time is required";
    }

    if (
      data.registrationType !== "open" &&
      data.registrationType !== "closed"
    ) {
      errors.registrationType = "Registration type must be open or closed";
    }

    const minimum = data.bracketType === "double_elimination" ? 4 : 2;

    if (!data.entrantCapacity || data.entrantCapacity < minimum)
      errors.entrantCapacity = `At least ${minimum} entrants required`;
  }

  if (step === 3) {
    if (!data.presetId) {
      errors.presetId = "Please select a match preset";
    } else if (data.presetId !== "custom") {
      if (!mongoose.Types.ObjectId.isValid(data.presetId)) {
        errors.presetId = "Invalid preset ID format";
      } else {
        await connectMongoDB();

        const preset = await ContestPreset.findById(data.presetId);

        if (!preset) {
          errors.presetId = "Selected preset does not exist";
        } else if (preset.archived) {
          errors.presetId = "Selected preset is archived";
        }
      }
    }
  }

  return ok({ valid: Object.keys(errors).length === 0, errors });
}

async function createBracketContestAction(input: unknown) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session) return appError("UNAUTHENTICATED", "Unauthorized");

  const isHeadUser = isHead(session.user.access);

  const parsed = contestCreationPayloadSchema.safeParse(input);

  if (!parsed.success) return validationError(parsed.error);

  const data = parsed.data;

  if (
    process.env.NODE_ENV === "production" &&
    data.problemSelectionMode === "test"
  ) {
    return appError(
      "VALIDATION_ERROR",
      "Problem selection mode must be 'bulk' or 'fine-tuned'.",
    );
  }

  if (!isHeadUser && (data.entrantCapacity ?? 0) > 8) {
    return appError(
      "FORBIDDEN",
      "Non-admin users cannot create a knockout tournament with more than 8 entrants.",
    );
  }

  await connectMongoDB();

  // Server-side validation
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
  const startError = contestStartTimeError(
    data.startTime,
    false,
    contestRegistrationTiming(webEnv),
  );

  if (startError) return appError("VALIDATION_ERROR", startError);

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

  let presetId = undefined;
  let problemSelectionMode = data.problemSelectionMode;
  let bulkPlatform = data.bulkPlatform || "codeforces";
  let bulkRatingMin = data.bulkRatingMin;
  let bulkRatingMax = data.bulkRatingMax;
  let bulkProblemCount = data.bulkProblemCount;
  let bulkMinContestId = data.bulkMinContestId ?? 0;
  let problemSlots: ContestProblemSlot[] = [];
  let durationSeconds: number | undefined;

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
    durationSeconds = preset.durationSeconds;
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

      for (let i = 0; i < problemSlots.length; i++) {
        const slot = problemSlots[i];

        if (
          slot.points !== undefined &&
          slot.points !== null &&
          slot.points < 80
        ) {
          return appError(
            "VALIDATION_ERROR",
            `Problem ${i + 1} (${slot.problemId}): points must be at least 80.`,
          );
        }
      }
    }
  }

  const allocationError = problemAllocationError({
    ...data,
    format: "bracket",
    problemSelectionMode,
    bulkProblemCount,
    problemSlots,
  });

  if (allocationError) return appError("VALIDATION_ERROR", allocationError);

  const registrations = await prepareContestRegistrations(data);

  if (!registrations.ok) return registrations;

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
      spectatorRestriction: data.spectatorRestriction,
      durationSeconds: durationSeconds,
      presetId: presetId,
      problemSelectionMode: problemSelectionMode,
      bulkPlatform: bulkPlatform,
      bulkRatingMin: bulkRatingMin,
      bulkRatingMax: bulkRatingMax,
      bulkProblemCount: bulkProblemCount,
      bulkMinContestId: bulkMinContestId || undefined,
      problemSlots: problemSlots,
      registrations: registrations.data,
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
        entrantCapacity: data.entrantCapacity,
      },
      overallDurationMinutes: data.overallDurationMinutes,
      perProblemDurationMinutes: data.perProblemDurationMinutes,
      bracketSettings: {
        type: data.bracketType || "single_elimination",
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

async function getContestTeamRequestsAction(teamId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await connectMongoDB();

    const parsed = contestRegistrationIdSchema.safeParse(teamId);

    if (!parsed.success) return validationError(parsed.error);

    const team = await ContestRegistrationTeam.findById(parsed.data);

    if (!team) return appError("NOT_FOUND", "Team not found");

    if (team.leaderId !== userId) {
      return appError("FORBIDDEN", "Only team leader can view requests");
    }

    const requests = await ContestTeamRequest.find({
      teamId: team._id,
      contestId: team.contestId,
      status: "pending",
    }).lean();

    // Collect all userIds we need to resolve
    const userIds = new Set<string>();

    for (const req of requests) {
      if (req.fromUserId) userIds.add(req.fromUserId);

      if (req.toUserId) userIds.add(req.toUserId);
    }

    const cpUsers = await CPUser.find(
      { userId: { $in: Array.from(userIds) } },
      "userId cfHandle",
    ).lean();
    const handleMap = new Map<string, string>();

    for (const cp of cpUsers) {
      handleMap.set(cp.userId.toString(), cp.cfHandle || cp.userId.toString());
    }

    const enriched = requests.map((req) =>
      toContestTeamRequestDto(req, handleMap),
    );

    return ok(enriched);
  } catch (error) {
    logger.error("Failed to get team requests", {
      action: "getContestTeamRequests",
      ...errorToLogMetadata(error),
    });

    return appError("INTERNAL_ERROR", "An unexpected error occurred");
  }
}

async function requestToJoinContestTeamAction(
  contestId: string,
  teamId: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) return appError("UNAUTHENTICATED", "Unauthorized");

  const parsed = contestTeamTargetSchema.safeParse({ contestId, teamId });

  if (!parsed.success) return validationError(parsed.error);

  const result = await sendContestTeamRequest(session.user.id, parsed.data);

  if (result.ok) revalidatePath("/internal/contests");

  return result;
}

async function inviteToContestTeamAction(
  contestId: string,
  teamId: string,
  cfHandle: string,
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) return appError("UNAUTHENTICATED", "Unauthorized");

  const parsed = contestTeamInviteSchema.safeParse({
    contestId,
    teamId,
    cfHandle,
  });

  if (!parsed.success) return validationError(parsed.error);

  const result = await sendContestTeamRequest(session.user.id, parsed.data);

  if (result.ok) revalidatePath("/internal/contests");

  return result;
}

async function respondToContestTeamRequestAction(
  requestId: string,
  action: "accept" | "reject",
) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) return appError("UNAUTHENTICATED", "Unauthorized");

  const parsed = contestTeamResponseSchema.safeParse({ requestId, action });

  if (!parsed.success) return validationError(parsed.error);

  const result = await respondToTeamRequest(
    session.user.id,
    parsed.data.requestId,
    parsed.data.action,
  );

  if (result.ok) revalidatePath("/internal/contests");

  return result;
}

async function getMyContestInvitesAction() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await connectMongoDB();

    const invites = await ContestTeamRequest.find({
      toUserId: userId,
      type: "invite",
      status: "pending",
    }).lean();

    if (invites.length === 0) return ok([]);

    // Enrich with team + contest info
    const enriched = await Promise.all(
      invites.map(async (invite) => {
        const team = await ContestRegistrationTeam.findOne(
          { _id: invite.teamId, contestId: invite.contestId },
          "name contestId leaderId",
        ).lean();
        const contest = team
          ? await ContestMatch.findById(team.contestId, "name status").lean()
          : null;
        const leaderCp = team
          ? await CPUser.findOne({ userId: team.leaderId }, "cfHandle").lean()
          : null;

        return {
          _id: invite._id.toString(),
          teamId: invite.teamId.toString(),
          teamName: team?.name || "Unknown Team",
          contestId: team?.contestId?.toString() || "",
          contestName: contest?.name || "Unknown Contest",
          contestStatus: contest?.status || "",
          invitedByHandle: leaderCp?.cfHandle || team?.leaderId || "Unknown",
        };
      }),
    );

    return ok(enriched);
  } catch (error) {
    logger.error("Failed to get invites", {
      action: "getMyContestInvites",
      ...errorToLogMetadata(error),
    });

    return appError("INTERNAL_ERROR", "An unexpected error occurred");
  }
}

async function getMyTeamJoinRequestsAction() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;

    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await connectMongoDB();

    // First find all teams where this user is the leader
    const myTeams = await ContestRegistrationTeam.find(
      { leaderId: userId },
      "_id name contestId",
    ).lean();

    if (myTeams.length === 0) return ok([]);

    // Now find pending join requests for these teams
    const requests = await ContestTeamRequest.find({
      $or: myTeams.map((team) => ({
        teamId: team._id,
        contestId: team.contestId,
      })),
      type: "join_request",
      status: "pending",
    }).lean();

    if (requests.length === 0) return ok([]);

    // Collect userIds to resolve CF handles
    const fromUserIds = requests.map((r) => r.fromUserId);
    const cpUsers = await CPUser.find(
      { userId: { $in: fromUserIds } },
      "userId cfHandle",
    ).lean();
    const handleMap = new Map(
      cpUsers.map((cp) => [
        cp.userId.toString(),
        cp.cfHandle || cp.userId.toString(),
      ]),
    );

    // Map team info
    const teamMap = new Map(myTeams.map((t) => [t._id.toString(), t]));

    // Get contest info
    const contestIds = Array.from(
      new Set(myTeams.map((t) => t.contestId.toString())),
    );
    const contests = await ContestMatch.find(
      { _id: { $in: contestIds } },
      "name status",
    ).lean();
    const contestMap = new Map(contests.map((c) => [c._id.toString(), c]));

    const enriched = requests.map((req) => {
      const team = teamMap.get(req.teamId.toString());
      const contest = team ? contestMap.get(team.contestId.toString()) : null;

      return {
        _id: req._id.toString(),
        teamId: req.teamId.toString(),
        teamName: team?.name || "Unknown Team",
        contestId: team?.contestId?.toString() || "",
        contestName: contest?.name || "Unknown Contest",
        fromUserId: req.fromUserId,
        fromUserHandle: handleMap.get(req.fromUserId) || req.fromUserId,
      };
    });

    return ok(enriched);
  } catch (error) {
    logger.error("Failed to get team join requests", {
      action: "getMyTeamJoinRequests",
      ...errorToLogMetadata(error),
    });

    return appError("INTERNAL_ERROR", "An unexpected error occurred");
  }
}
