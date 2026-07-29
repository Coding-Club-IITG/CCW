"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
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

export async function getContestListing(): Promise<{
  active: ContestListingItem[];
  upcoming: ContestListingItem[];
  completed: ContestListingItem[];
}> {
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
          (r: any) => r.userId.toString() === userId,
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
          const userTeam = teams.find((t: any) =>
            t.members.some((m: any) => m.toString() === userId),
          );
          if (userTeam) {
            item.userScore = userTeam.score;
            const otherTeams = teams.filter(
              (t: any) => t._id.toString() !== userTeam._id.toString(),
            );
            item.opponentScore =
              otherTeams.length > 0
                ? Math.max(...otherTeams.map((t: any) => t.score))
                : 0;
            item.otherScores = otherTeams
              .map((t: any) => t.score)
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

  return { active, upcoming, completed };
}

export async function getContestById(
  id: string,
): Promise<ContestListingItem | null> {
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
    if (!contest) return null;

    const isRegistered = userId
      ? (contest.registrations || []).some(
          (r: any) => r.userId.toString() === userId,
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

    return {
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
    };
  } catch (error) {
    console.error("Error fetching contest by id:", error);
    return null;
  }
}

import { revalidatePath } from "next/cache";

export async function registerForContest(
  contestId: string,
  teamName?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, message: "Unauthorized" };

    await dbConnect();
    const cpUser = await CPUser.findOne({ userId });
    if (!cpUser) return { success: false, message: "CP Profile not found" };

    const contest = await ContestMatch.findById(contestId);
    if (!contest) return { success: false, message: "Contest not found" };

    if (contest.status !== "registration") {
      return {
        success: false,
        message: "Contest is not open for registration",
      };
    }

    const isAlreadyRegistered = contest.registrations?.some(
      (r: any) => r.userId.toString() === userId,
    );
    if (isAlreadyRegistered) {
      return { success: false, message: "Already registered" };
    }

    if (!contest.registrations) contest.registrations = [];

    const tName = teamName || cpUser.cfHandle || "unknown";

    if (contest.teamSize > 1) {
      const teamMembers = contest.registrations.filter(
        (r: any) => r.teamName === tName,
      );
      if (teamMembers.length >= contest.teamSize) {
        return { success: false, message: "Team is already full." };
      }
    } else {
      // For solo, ensure no duplicate team name
      const teamExists = contest.registrations.some(
        (r: any) => r.teamName === tName,
      );
      if (teamExists) {
        return { success: false, message: "Display name already taken." };
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
    return { success: true, message: "Successfully registered" };
  } catch (error) {
    console.error("Registration error:", error);
    return { success: false, message: "Internal server error" };
  }
}

export async function getAvailableTeamsForContest(
  contestId: string,
): Promise<{ teamName: string; memberCount: number; maxCapacity: number }[]> {
  try {
    await dbConnect();
    const contest = await ContestMatch.findById(contestId).lean();
    if (!contest || contest.teamSize <= 1) return [];

    const registrations = contest.registrations || [];
    const teamCounts: Record<string, number> = {};

    for (const reg of registrations) {
      if (reg.teamName) {
        teamCounts[reg.teamName] = (teamCounts[reg.teamName] || 0) + 1;
      }
    }

    const availableTeams = Object.entries(teamCounts)
      .filter(([_, count]) => count < contest.teamSize)
      .map(([teamName, count]) => ({
        teamName,
        memberCount: count,
        maxCapacity: contest.teamSize,
      }));

    return availableTeams;
  } catch (error) {
    console.error("Error fetching available teams:", error);
    return [];
  }
}

import { reconciliationQueue } from "@/lib/bullmq";
import mongoose from "mongoose";

export async function createRoomContest(
  data: any,
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Unauthorized" };

    await dbConnect();
    const cpUser = await CPUser.findOne({ userId });
    if (!cpUser) return { success: false, error: "CP Profile not found" };

    const start = new Date(data.startTime);
    const deadlineStr = process.env.REGISTRATION_DEADLINE_MINUTES;
    if (!deadlineStr) {
      throw new Error(
        "REGISTRATION_DEADLINE_MINUTES is not set in environment variables.",
      );
    }
    const deadlineMinutes = parseInt(deadlineStr, 10);
    if (isNaN(deadlineMinutes)) {
      throw new Error("REGISTRATION_DEADLINE_MINUTES must be a valid number.");
    }
    const deadline = new Date(start.getTime() - deadlineMinutes * 60000);

    // Validate start time is at least 2 minutes from now (1 min registration + 1 min buffer)
    if (start.getTime() < Date.now() + 2 * 60000 - 5000) {
      // 5s grace period
      return {
        success: false,
        error:
          "Start time must be strictly at least 2 minutes ahead of current time",
      };
    }

    // Format-specific backend validations and overrides
    let { maxParticipants, teamSize, format } = data;

    if (format === "1v1") {
      teamSize = 1;
      maxParticipants = 2;
    } else if (format === "solo-tournament") {
      teamSize = 1;
      if (maxParticipants < 2)
        return { success: false, error: "At least 2 participants required." };
    } else if (format === "team-tournament") {
      teamSize = 3;
      if (maxParticipants < 6)
        return {
          success: false,
          error: "Team battles require at least 6 participants.",
        };
      maxParticipants = maxParticipants - (maxParticipants % 3);
    }

    let problemSlots: any[] = [];
    if (
      data.problemSelectionMode === "fine-tuned" &&
      Array.isArray(data.fineTunedProblems)
    ) {
      problemSlots = data.fineTunedProblems.map((id: string) => ({
        platform: "codeforces",
        problemId: id.trim(),
      }));
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
      registrationSettings: {
        type: data.registrationType || "open",
        startTime: data.registrationStartTime
          ? new Date(data.registrationStartTime)
          : undefined,
        deadline: deadline,
        maxParticipants: maxParticipants,
      },
      registrations: (data.registeredUsers || []).map((u: any) => ({
        userId: new mongoose.Types.ObjectId(u.id),
        cfHandle: u.cfHandle,
        teamName: u.teamName,
        registeredAt: new Date(),
      })),
    });

    await contest.save();

    // Handle scheduling based on registrationStartTime and deadline
    const now = Date.now();
    const regStartTime = data.registrationStartTime
      ? new Date(data.registrationStartTime).getTime()
      : now;
    const deadlineTime = contest.registrationSettings!.deadline!.getTime();

    // Validate registration starts before it ends (only for open registration)
    if (data.registrationType !== "closed" && regStartTime >= deadlineTime) {
      await ContestMatch.findByIdAndDelete(contest._id);
      return {
        success: false,
        error: "Registration start time must be before the deadline.",
      };
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
    return { success: true };
  } catch (err: any) {
    console.error("createRoomContest error:", err);
    return { success: false, error: "Failed to create contest" };
  }
}

export async function getContestRegistrations(contestId: string) {
  try {
    await dbConnect();
    const contest = await ContestMatch.findById(contestId).lean();
    if (!contest) return { success: false, error: "Contest not found" };

    const User = (await import("@/models/User")).default;
    const userIds = (contest.registrations || []).map((r: any) => r.userId);
    const users = await User.find({ _id: { $in: userIds } }, "image").lean();
    const imageMap: Record<string, string> = {};
    users.forEach((u: any) => {
      if (u.image) imageMap[u._id.toString()] = u.image;
    });

    const populatedRegistrations = (contest.registrations || []).map(
      (r: any) => ({
        ...r,
        image: imageMap[r.userId.toString()] || null,
      }),
    );

    const isDeadlinePassed = contest.registrationSettings?.deadline
      ? new Date() > new Date(contest.registrationSettings.deadline)
      : false;

    return {
      success: true,
      format: contest.format,
      teamSize: contest.teamSize,
      registrationType: contest.registrationSettings?.type,
      isDeadlinePassed,
      registrations: JSON.parse(JSON.stringify(populatedRegistrations)),
    };
  } catch (error) {
    console.error("Error fetching contest registrations:", error);
    return { success: false, error: "Failed to fetch registrations" };
  }
}

export async function unregisterFromContest(
  contestId: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, message: "Unauthorized" };

    await dbConnect();

    const contest = await ContestMatch.findById(contestId);
    if (!contest) return { success: false, message: "Contest not found" };

    if (contest.status !== "registration") {
      return {
        success: false,
        message: "Cannot unregister after registration has closed.",
      };
    }

    if (!contest.registrations)
      return { success: false, message: "Not registered" };

    const initialLength = contest.registrations.length;
    contest.registrations = contest.registrations.filter(
      (r: any) => r.userId.toString() !== userId,
    );

    if (contest.registrations.length === initialLength) {
      return { success: false, message: "Not registered" };
    }

    await contest.save();

    revalidatePath("/internal/contests");
    return { success: true, message: "Successfully unregistered" };
  } catch (error) {
    console.error("Unregister error:", error);
    return { success: false, message: "Internal server error" };
  }
}

export async function searchVerifiedUsers(query: string) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return { error: "Unauthorized" };

  if (!query || query.length < 2) return { users: [] };

  await dbConnect();

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const users = await User.find({
    name: { $regex: escapedQuery, $options: "i" },
  })
    .select("_id name image pizza_count")
    .limit(20)
    .lean();

  if (users.length === 0) return { users: [] };

  const userIds = users.map((u: any) => u._id);

  // Find which of these users are CPUsers with verified handles
  const cpUsers = await CPUser.find({
    userId: { $in: userIds },
    cfHandle: { $ne: "" },
  })
    .select("userId cfHandle cfRating")
    .lean();

  const cpUserMap = new Map();
  for (const c of cpUsers) {
    cpUserMap.set(c.userId.toString(), {
      cfHandle: c.cfHandle,
      cfRating: c.cfRating,
    });
  }

  const result = users
    .filter((u: any) => cpUserMap.has(u._id.toString()))
    .map((u: any) => {
      const cpData = cpUserMap.get(u._id.toString());
      return {
        id: u._id.toString(),
        name: u.name,
        image: u.image,
        pizza_count: u.pizza_count || 0,
        cfHandle: cpData.cfHandle,
        cfRating: cpData.cfRating || 0,
      };
    });

  return { users: result };
}

// ─── Bracket / Knockout creation for all authenticated users ──────────────────

export async function createBracketContest(data: any) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return { error: "Unauthorized" };

  await dbConnect();

  // ── Server-side validation ──────────────────────────────────────────────────
  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    return { error: "Contest name is required." };
  }
  if (data.name.trim().length > 100) {
    return { error: "Contest name must be 100 characters or fewer." };
  }
  if (!data.mode || !["blitz", "arena"].includes(data.mode)) {
    return { error: "Mode must be either 'blitz' or 'arena'." };
  }
  if (!data.startTime || isNaN(new Date(data.startTime).getTime())) {
    return { error: "A valid start time is required." };
  }
  const deadlineEnvStr = process.env.REGISTRATION_DEADLINE_MINUTES;
  if (!deadlineEnvStr)
    return { error: "REGISTRATION_DEADLINE_MINUTES is not configured." };
  const _deadlineMinutes = parseInt(deadlineEnvStr, 10);
  if (isNaN(_deadlineMinutes))
    return { error: "REGISTRATION_DEADLINE_MINUTES must be a valid number." };
  const _startMs = new Date(data.startTime).getTime();
  const _minStart = Date.now() + (_deadlineMinutes + 1) * 60000;
  if (_startMs < _minStart) {
    return {
      error: `Start time must be at least ${_deadlineMinutes + 1} minutes in the future.`,
    };
  }
  if (!data.registrationType || !["open", "closed"].includes(data.registrationType)) {
    return { error: "Registration type must be 'open' or 'closed'." };
  }
  // ───────────────────────────────────────────────────────────────────────────

  let presetId = undefined;
  let problemSelectionMode = data.problemSelectionMode;
  let bulkPlatform = data.bulkPlatform || "codeforces";
  let bulkRatingMin = data.bulkRatingMin;
  let bulkRatingMax = data.bulkRatingMax;
  let bulkProblemCount = data.bulkProblemCount;
  let bulkMinContestId = data.bulkMinContestId ?? 0;
  let problemSlots: any[] = [];

  if (data.presetId && data.presetId !== "custom") {
    const ContestPreset = (await import("@/models/ContestPreset")).default;
    const preset = await ContestPreset.findById(data.presetId);
    if (!preset) return { error: "Selected preset does not exist" };
    if (preset.archived) return { error: "Selected preset is archived" };
    presetId = preset._id;
    problemSelectionMode = preset.problemSelectionMode;
    bulkPlatform = preset.bulkPlatform;
    bulkRatingMin = preset.bulkRatingMin;
    bulkRatingMax = preset.bulkRatingMax;
    bulkProblemCount = data.bulkProblemCount || preset.bulkProblemCount;
    bulkMinContestId = data.bulkMinContestId ?? preset.bulkMinContestId ?? 0;
    problemSlots =
      data.problemSlots && data.problemSlots.length > 0
        ? data.problemSlots
        : preset.problemSlots;
  } else {
    // custom — validate bulk / fine-tuned fields
    if (!problemSelectionMode || !["bulk", "fine-tuned"].includes(problemSelectionMode)) {
      return { error: "Problem selection mode must be 'bulk' or 'fine-tuned'." };
    }
    if (problemSelectionMode === "bulk") {
      const rMin = Number(bulkRatingMin);
      const rMax = Number(bulkRatingMax);
      const rCount = Number(bulkProblemCount);
      if (isNaN(rMin) || isNaN(rMax) || rMin < 800 || rMax > 3500) {
        return { error: "Rating range must be between 800 and 3500." };
      }
      if (rMin >= rMax) {
        return { error: "Minimum rating must be less than maximum rating." };
      }
      if (isNaN(rCount) || rCount < 1 || rCount > 20) {
        return { error: "Problem count must be between 1 and 20." };
      }
    }
    if (problemSelectionMode === "fine-tuned") {
      if (!Array.isArray(data.problemSlots) || data.problemSlots.length === 0) {
        return {
          error:
            "Fine-tuned problem slots with round assignments are required for a bracket contest.",
        };
      }
      problemSlots = data.problemSlots.filter(
        (s: any) => s.problemId && s.problemId.trim() !== "",
      );
      if (problemSlots.length === 0) {
        return {
          error: "Please provide valid problem IDs for the bracket rounds.",
        };
      }
    }
  }

  // Validate registered user CP-profile eligibility (for closed seeded brackets)
  if (Array.isArray(data.registeredUsers) && data.registeredUsers.length > 0) {
    for (const u of data.registeredUsers) {
      if (!u.id || !mongoose.Types.ObjectId.isValid(u.id)) {
        return { error: `Invalid user ID: ${u.id}` };
      }
      const cp = await CPUser.findOne({ userId: new mongoose.Types.ObjectId(u.id) });
      if (!cp) {
        return { error: `User ${u.id} does not have a linked CP profile.` };
      }
      if (!cp.cfHandle) {
        return { error: `User ${u.id} does not have a verified Codeforces handle.` };
      }
    }
  }

  try {
    const cpUser = await CPUser.findOne({ userId: session.user.id });
    if (!cpUser) return { error: "CP Profile not found" };

    const deadlineStr = process.env.REGISTRATION_DEADLINE_MINUTES;
    if (!deadlineStr)
      throw new Error(
        "REGISTRATION_DEADLINE_MINUTES is not set in environment variables.",
      );
    const deadlineMinutes = parseInt(deadlineStr, 10);
    if (isNaN(deadlineMinutes))
      throw new Error("REGISTRATION_DEADLINE_MINUTES must be a valid number.");

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
      registrations: (data.registeredUsers || []).map((u: any) => ({
        userId: new mongoose.Types.ObjectId(u.id),
        cfHandle: u.cfHandle,
        teamName: u.teamName,
        registeredAt: new Date(),
      })),
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
      bracketSettings: {
        thirdPlacePlayoff: !!data.thirdPlacePlayoff,
        seedingMethod: data.seedingMethod || "cf_rating",
      },
    });

    const now = Date.now();
    const regStartTime = data.registrationStartTime
      ? new Date(data.registrationStartTime).getTime()
      : now;
    const deadlineTime = contest.registrationSettings!.deadline!.getTime();

    if (data.registrationType !== "closed" && regStartTime >= deadlineTime) {
      await ContestMatch.findByIdAndDelete(contest._id);
      return { error: "Registration start time must be before the deadline." };
    }

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
    return { contestId: contest._id.toString() };
  } catch (err: any) {
    return { error: err.message || "Failed to create bracket contest" };
  }
}
