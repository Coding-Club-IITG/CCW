"use server";

import { err as appError, ok, validationError } from "@/lib/api/result";

import { defineAction } from "@/lib/actions/defineAction";
import { parseRoles } from "@/lib/roles";

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
import ContestRegistrationTeam from "@/models/ContestRegistrationTeam";
import ContestTeamRequest from "@/models/ContestTeamRequest";
import NotificationModel from "@/models/Notification";

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
    let canSpectate = false;
    const restriction = (contest as any).spectatorRestriction || "none";
    if (restriction === "all") {
      canSpectate = true;
    } else if (userId && restriction !== "none") {
      const isCreator = contest.creatorId?.toString() === userId;
      const isAdmin = isHead(session?.user?.access);
      if (restriction === "admin_creator") {
        canSpectate = isAdmin || isCreator;
      } else if (restriction === "club_members") {
        if (isAdmin || isCreator) canSpectate = true;
        else {
          const roles = parseRoles(session?.user?.roles);
          canSpectate = roles.length > 0;
        }
      }
    }

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
    };

    if (isRegistered && contest.teamSize && contest.teamSize > 1) {
        const userReg = (contest.registrations || []).find(r => r.userId.toString() === userId);
        if (userReg) {
           item.registeredTeamName = userReg.teamName;
           const regTeam = await ContestRegistrationTeam.findOne({ contestId: contest._id, name: userReg.teamName }).lean();
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
  joinCode?: string
) {
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

    if (contest.registrations.some(r => r.userId.toString() === cpUser.userId.toString())) {
      return appError("CONFLICT", "You are already registered for this contest. Please unregister first to change teams.");
    }

    const tName = teamName || cpUser.cfHandle || "unknown";

    let finalTeamName = tName;
    const teamSize = contest.teamSize ?? 1;
    if (teamSize > 1) {
      const ContestRegistrationTeam = mongoose.models.ContestRegistrationTeam;
      // Case-insensitive lookup for the team name
      let regTeam = await ContestRegistrationTeam.findOne({ 
          contestId: contest._id, 
          name: { $regex: new RegExp(`^${tName}$`, 'i') } 
      });

      // isPublic is passed only when creating a new team
      const isCreatingNewTeam = isPublic !== undefined;

      if (isCreatingNewTeam) {
        if (regTeam) {
          return appError("CONFLICT", "A team with this name already exists. Please choose a different name.");
        }
        // Create new team with the exact casing provided
        regTeam = await ContestRegistrationTeam.create({
            contestId: contest._id,
            name: tName,
            leaderId: userId,
            isPublic: isPublic,
            joinCode: joinCode || undefined
        });
      } else {
        if (!regTeam) {
          return appError("NOT_FOUND", "Team not found.");
        }
        if (!regTeam.isPublic) {
            if (!regTeam.joinCode || regTeam.joinCode !== joinCode) {
                return appError("FORBIDDEN", "Invalid join code for this private team. You may need to request to join instead.");
            }
        }
        // If joining, we should use the exact team name as registered in the database
        // to avoid casing mismatches when counting team members later
      }

      finalTeamName = regTeam.name;

      // Ensure we count team members against the exact existing casing if joining
      const teamMembers = contest.registrations.filter(
        (registration) => registration.teamName === finalTeamName,
      );
      if (teamMembers.length >= teamSize) {
        return appError("CONFLICT", "Team is already full.");
      }
    } else {
      // For solo, ensure no duplicate team name
      const teamExists = contest.registrations.some(
        (registration) => registration.teamName?.toLowerCase() === tName.toLowerCase(),
      );
      if (teamExists) {
        return appError("CONFLICT", "Display name already taken.");
      }
    }

    contest.registrations.push({
      userId: cpUser.userId,
      cfHandle: cpUser.cfHandle || "unknown",
      teamName: finalTeamName,
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

    const ContestRegistrationTeam = (await import("@/models/ContestRegistrationTeam")).default;
    const regTeams = await ContestRegistrationTeam.find({ contestId: contest._id }).lean();
    const regTeamMap = new Map(regTeams.map(t => [t.name, t]));

    const availableTeams = Object.entries(teamCounts)
      .filter(([_, count]) => count < teamSize)
      .map(([teamName, count]) => {
        const teamInfo = regTeamMap.get(teamName);
        return {
          teamName,
          memberCount: count,
          maxCapacity: teamSize,
          isPublic: teamInfo ? teamInfo.isPublic : true,
          leaderId: teamInfo ? teamInfo.leaderId : "",
          requiresJoinCode: teamInfo ? (!teamInfo.isPublic) : false,
          teamId: teamInfo ? teamInfo._id.toString() : "",
        };
      });

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
    if (!parsed.success) { console.error('Zod Error:', parsed.error); return validationError(parsed.error); }
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
      spectatorRestriction: data.spectatorRestriction,
      durationSeconds: durationSeconds,
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


export async function getContestRegistrationsAction(
  contestId: string,
) {
  try {
    const contest = await ContestMatch.findById(contestId);
    if (!contest) return appError("NOT_FOUND", "Contest not found");

    const User = (await import("@/models/User")).default;
    const userIds = (contest.registrations || []).map(
      (registration) => registration.userId,
    );
    const users = await User.find({ _id: { $in: userIds } }, "image").lean();

    const imageMap: Record<string, string> = {};
    users.forEach((user: any) => {
      if (user.image) imageMap[user._id.toString()] = user.image;
    });

    const populatedRegistrations = (contest.registrations || []).map(
      (registration) => ({
        userId: registration.userId.toString(),
        cfHandle: registration.cfHandle ?? "",
        image: imageMap[registration.userId.toString()],
        teamName: registration.teamName,
      }),
    );

    const isDeadlinePassed = contest.registrationSettings?.deadline
      ? new Date() > new Date(contest.registrationSettings.deadline)
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

export async function unregisterFromContestAction(contestId: string) {
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
    const userRegistration = (contest.registrations || []).find(
      (registration) => registration.userId.toString() === userId,
    );
    if (!userRegistration) return appError("NOT_FOUND", "Not registered");

    contest.registrations = (contest.registrations || []).filter(
      (registration) => registration.userId.toString() !== userId,
    );

    if (contest.teamSize && contest.teamSize > 1 && userRegistration.teamName) {
        const ContestRegistrationTeam = (await import("@/models/ContestRegistrationTeam")).default;
        const team = await ContestRegistrationTeam.findOne({ contestId: contest._id, name: userRegistration.teamName });
        if (team) {
            // Check if there are other members left in the team
            const remainingMembers = (contest.registrations || []).filter(r => r.teamName === team.name);
            if (remainingMembers.length === 0) {
                // Delete team since no members are left
                await ContestRegistrationTeam.findByIdAndDelete(team._id);
            } else if (team.leaderId === userId) {
                // Assign new leader
                team.leaderId = remainingMembers[0].userId.toString();
                await team.save();
            }
        }
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
  if (!parsed.success) { console.error('Zod Error:', parsed.error); return validationError(parsed.error); }
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

async function getContestTeamRequestsAction(teamId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await dbConnect();
    const team = await ContestRegistrationTeam.findById(teamId);
    if (!team) return appError("NOT_FOUND", "Team not found");

    if (team.leaderId !== userId) {
      return appError("FORBIDDEN", "Only team leader can view requests");
    }

    const requests = await ContestTeamRequest.find({ teamId, status: "pending" }).lean();

    // Collect all userIds we need to resolve
    const userIds = new Set<string>();
    for (const req of requests) {
      if (req.fromUserId) userIds.add(req.fromUserId);
      if (req.toUserId) userIds.add(req.toUserId);
    }

    const cpUsers = await CPUser.find({ userId: { $in: Array.from(userIds) } }, "userId cfHandle").lean();
    const handleMap = new Map<string, string>();
    for (const cp of cpUsers) {
      handleMap.set(cp.userId.toString(), cp.cfHandle || cp.userId.toString());
    }

    const enriched = requests.map(req => ({
      ...req,
      _id: req._id.toString(),
      fromUserHandle: handleMap.get(req.fromUserId) || req.fromUserId,
      toUserHandle: req.toUserId ? (handleMap.get(req.toUserId) || req.toUserId) : undefined,
    }));

    return ok(enriched);
  } catch (error) {
    logger.error("Failed to get team requests", { action: "getContestTeamRequests", ...errorToLogMetadata(error) });
    return appError("INTERNAL_ERROR", "An unexpected error occurred");
  }
}

async function requestToJoinContestTeamAction(contestId: string, teamId: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await dbConnect();
    const contest = await ContestMatch.findById(contestId);
    if (!contest || contest.status !== "registration") return appError("VALIDATION_ERROR", "Contest not open");

    const team = await ContestRegistrationTeam.findById(teamId);
    if (!team) return appError("NOT_FOUND", "Team not found");

    const cpUser = await CPUser.findOne({ userId });
    if (!cpUser) return appError("NOT_FOUND", "CP user not found");

    if (contest.registrations?.some(r => r.userId.toString() === userId)) {
        return appError("CONFLICT", "You are already registered for this contest.");
    }

    const teamSize = contest.teamSize || 1;
    const teamMembers = (contest.registrations || []).filter(r => r.teamName === team.name);
    if (teamMembers.length >= teamSize) {
        return appError("CONFLICT", "Team is already full.");
    }

    const existingRequest = await ContestTeamRequest.findOne({ teamId, fromUserId: userId, status: "pending", type: "join_request" });
    if (existingRequest) return appError("CONFLICT", "Join request already pending");

    await ContestTeamRequest.create({
      contestId,
      teamId,
      type: "join_request",
      fromUserId: userId,
      status: "pending"
    });
    
    // Notify leader
    await NotificationModel.create({
        userId: team.leaderId,
        type: "join_request",
        title: "New Team Join Request",
        message: `${cpUser.cfHandle} has requested to join your team ${team.name}.`,
    });

    return ok({ message: "Join request sent successfully" });
  } catch (error) {
    logger.error("Failed to send join request", { action: "requestToJoinContestTeam", ...errorToLogMetadata(error) });
    return appError("INTERNAL_ERROR", "An unexpected error occurred");
  }
}

async function inviteToContestTeamAction(contestId: string, teamId: string, cfHandle: string) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await dbConnect();
    const team = await ContestRegistrationTeam.findById(teamId);
    if (!team || team.leaderId !== userId) return appError("FORBIDDEN", "Not team leader");

    const targetUser = await CPUser.findOne({ cfHandle: new RegExp(`^${cfHandle}$`, 'i') });
    if (!targetUser) return appError("NOT_FOUND", "Codeforces user not found in system");

    const contest = await ContestMatch.findById(contestId);
    if (!contest || contest.status !== "registration") return appError("VALIDATION_ERROR", "Contest not open");

    if (contest.registrations?.some(r => r.userId.toString() === targetUser.userId.toString())) {
        return appError("CONFLICT", "User is already registered for this contest.");
    }

    const teamSize = contest.teamSize || 1;
    const teamMembers = (contest.registrations || []).filter(r => r.teamName === team.name);
    if (teamMembers.length >= teamSize) {
        return appError("CONFLICT", "Team is already full.");
    }

    const existingInvite = await ContestTeamRequest.findOne({ teamId, toUserId: targetUser.userId, status: "pending", type: "invite" });
    if (existingInvite) return appError("CONFLICT", "Invite already pending");

    await ContestTeamRequest.create({
      contestId,
      teamId,
      type: "invite",
      fromUserId: userId,
      toUserId: targetUser.userId,
      status: "pending"
    });

    // Notify user
    await NotificationModel.create({
        userId: targetUser.userId,
        type: "team_invite",
        title: "Contest Team Invite",
        message: `You have been invited to join team ${team.name}.`,
    });

    return ok({ message: "Invite sent successfully" });
  } catch (error) {
    logger.error("Failed to send invite", { action: "inviteToContestTeam", ...errorToLogMetadata(error) });
    return appError("INTERNAL_ERROR", "An unexpected error occurred");
  }
}

async function respondToContestTeamRequestAction(requestId: string, action: "accept" | "reject") {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await dbConnect();
    const request = await ContestTeamRequest.findById(requestId);
    if (!request || request.status !== "pending") return appError("NOT_FOUND", "Request not found or already processed");

    const team = await ContestRegistrationTeam.findById(request.teamId);
    if (!team) return appError("NOT_FOUND", "Team not found");
    
    // For join requests, only leader can accept/reject. For invites, only the invited user can accept/reject.
    if (request.type === "join_request" && team.leaderId !== userId) {
        return appError("FORBIDDEN", "Only team leader can respond to join requests");
    }
    if (request.type === "invite" && request.toUserId !== userId) {
        return appError("FORBIDDEN", "Only invited user can respond to this invite");
    }

    request.status = action === "accept" ? "accepted" : "rejected";
    await request.save();

    if (action === "accept") {
        const contest = await ContestMatch.findById(request.contestId);
        if (contest) {
           const teamSize = contest.teamSize || 1;
           const teamMembers = (contest.registrations || []).filter(r => r.teamName === team.name);
           if (teamMembers.length >= teamSize) {
               return appError("CONFLICT", "Team is already full.");
           }

           const targetUserId = request.type === "join_request" ? request.fromUserId : request.toUserId;
           
           if (contest.registrations?.some(r => r.userId.toString() === targetUserId)) {
               return appError("CONFLICT", "User is already registered for this contest.");
           }

           const targetCPUser = await CPUser.findOne({ userId: targetUserId });
           
           if (targetCPUser) {
               contest.registrations = contest.registrations || [];
               contest.registrations.push({
                   userId: targetCPUser.userId,
                   cfHandle: targetCPUser.cfHandle || "unknown",
                   teamName: team.name,
                   registeredAt: new Date()
               });
               await contest.save();
           }
        }
    }

    
    revalidatePath("/internal/contests");
    return ok({ message: `Request ${action}ed successfully` });
  } catch (error) {
    logger.error("Failed to respond to request", { action: "respondToContestTeamRequest", ...errorToLogMetadata(error) });
    return appError("INTERNAL_ERROR", "An unexpected error occurred");
  }
}

async function getMyContestInvitesAction() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await dbConnect();

    const invites = await ContestTeamRequest.find({
      toUserId: userId,
      type: "invite",
      status: "pending",
    }).lean();

    if (invites.length === 0) return ok([]);

    // Enrich with team + contest info
    const enriched = await Promise.all(
      invites.map(async (invite) => {
        const team = await ContestRegistrationTeam.findById(invite.teamId, "name contestId leaderId").lean();
        const contest = team ? await ContestMatch.findById(team.contestId, "name status").lean() : null;
        const leaderCp = team ? await CPUser.findOne({ userId: team.leaderId }, "cfHandle").lean() : null;
        return {
          _id: invite._id.toString(),
          teamId: invite.teamId.toString(),
          teamName: team?.name || "Unknown Team",
          contestId: team?.contestId?.toString() || "",
          contestName: (contest as any)?.name || "Unknown Contest",
          contestStatus: (contest as any)?.status || "",
          invitedByHandle: leaderCp?.cfHandle || team?.leaderId || "Unknown",
        };
      })
    );

    return ok(enriched);
  } catch (error) {
    logger.error("Failed to get invites", { action: "getMyContestInvites", ...errorToLogMetadata(error) });
    return appError("INTERNAL_ERROR", "An unexpected error occurred");
  }
}

async function getMyTeamJoinRequestsAction() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return appError("UNAUTHENTICATED", "Unauthorized");

    await dbConnect();

    // First find all teams where this user is the leader
    const myTeams = await ContestRegistrationTeam.find({ leaderId: userId }, "_id name contestId").lean();
    if (myTeams.length === 0) return ok([]);

    const myTeamIds = myTeams.map(t => t._id);

    // Now find pending join requests for these teams
    const requests = await ContestTeamRequest.find({
      teamId: { $in: myTeamIds },
      type: "join_request",
      status: "pending",
    }).lean();

    if (requests.length === 0) return ok([]);

    // Collect userIds to resolve CF handles
    const fromUserIds = requests.map(r => r.fromUserId);
    const cpUsers = await CPUser.find({ userId: { $in: fromUserIds } }, "userId cfHandle").lean();
    const handleMap = new Map(cpUsers.map(cp => [cp.userId.toString(), cp.cfHandle || cp.userId.toString()]));

    // Map team info
    const teamMap = new Map(myTeams.map(t => [t._id.toString(), t]));

    // Get contest info
    const contestIds = Array.from(new Set(myTeams.map(t => t.contestId.toString())));
    const contests = await ContestMatch.find({ _id: { $in: contestIds } }, "name status").lean();
    const contestMap = new Map(contests.map(c => [c._id.toString(), c]));

    const enriched = requests.map(req => {
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
    logger.error("Failed to get team join requests", { action: "getMyTeamJoinRequests", ...errorToLogMetadata(error) });
    return appError("INTERNAL_ERROR", "An unexpected error occurred");
  }
}

