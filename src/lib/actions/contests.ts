"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import CustomContest from "@/models/CustomContest";
import CPUser from "@/models/CPUser";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";

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
  userScore?: number;
  opponentScore?: number;
  otherScores?: number[];
  isVictory?: boolean;
  roomStatus?: string;
  actualStartTime?: Date | null;
};

export async function getContestListing(): Promise<{ active: ContestListingItem[], upcoming: ContestListingItem[], completed: ContestListingItem[] }> {
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

  const contests = await CustomContest.find({
    status: { $in: ["registration", "active", "completed"] },
  }).lean();

  const active: ContestListingItem[] = [];
  const upcoming: ContestListingItem[] = [];
  const completed: ContestListingItem[] = [];

  for (const contest of contests) {
    const isRegistered = userId ? (contest.registrations || []).some((r: any) => r.userId.toString() === userId) : false;
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
      maxParticipants: contest.registrationSettings?.maxParticipants || 999,
    };
    
    let computedStatus = contest.status;
    const now = new Date();
    if (contest.status === "completed" || contest.status === "active") {
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
    
    if (computedStatus === "active" && userId) {
      const room = await ContestRoom.findOne({ contestId: contest._id, participants: userId }).lean();
      if (room) {
        item.roomStatus = room.status;
        item.actualStartTime = room.actualStartTime || null;
      }
    }

    item.status = computedStatus;

    if (computedStatus === "active") {
      if (userId) {
        const room = await ContestRoom.findOne({ contestId: contest._id, participants: userId }).lean();
        if (room) {
          item.roomStatus = room.status;
          item.actualStartTime = room.actualStartTime || null;
        }
      }
      active.push(item);
    } else if (computedStatus === "registration") {
      upcoming.push(item);
    } else if (computedStatus === "completed") {
      if (userId) {
        const room = await ContestRoom.findOne({ contestId: contest._id, participants: userId }).lean();
        if (room) {
          const teams = await ContestTeam.find({ roomId: room._id }).lean();
          const userTeam = teams.find((t: any) => t.members.some((m: any) => m.toString() === userId));
          if (userTeam) {
            item.userScore = userTeam.score;
            const otherTeams = teams.filter((t: any) => t._id.toString() !== userTeam._id.toString());
            item.opponentScore = otherTeams.length > 0 ? Math.max(...otherTeams.map((t: any) => t.score)) : 0;
            item.otherScores = otherTeams.map((t: any) => t.score).sort((a: number, b: number) => b - a);
            item.isVictory = (item.userScore ?? 0) >= (item.opponentScore ?? 0);
          }
        }
      }
      completed.push(item);
    }
  }
  
  // Sort
  active.sort((a, b) => (a.startTime && b.startTime) ? a.startTime.getTime() - b.startTime.getTime() : 0);
  upcoming.sort((a, b) => (a.startTime && b.startTime) ? a.startTime.getTime() - b.startTime.getTime() : 0);
  completed.sort((a, b) => (a.startTime && b.startTime) ? b.startTime.getTime() - a.startTime.getTime() : 0); // desc

  return { active, upcoming, completed };
}

export async function getContestById(id: string): Promise<ContestListingItem | null> {
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
    const contest = await CustomContest.findById(id).lean();
    if (!contest) return null;

    const isRegistered = userId ? (contest.registrations || []).some((r: any) => r.userId.toString() === userId) : false;
    
    let computedStatus = contest.status;
    const now = new Date();
    if (contest.status === "completed" || contest.status === "active") {
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
    };
  } catch (error) {
    console.error("Error fetching contest by id:", error);
    return null;
  }
}

import { revalidatePath } from "next/cache";

export async function registerForContest(contestId: string, teamName?: string): Promise<{ success: boolean; message: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, message: "Unauthorized" };

    await dbConnect();
    const cpUser = await CPUser.findOne({ userId });
    if (!cpUser) return { success: false, message: "CP Profile not found" };

    const contest = await CustomContest.findById(contestId);
    if (!contest) return { success: false, message: "Contest not found" };

    if (contest.status !== "registration") {
      return { success: false, message: "Contest is not open for registration" };
    }

    const isAlreadyRegistered = contest.registrations?.some((r: any) => r.userId.toString() === userId);
    if (isAlreadyRegistered) {
      return { success: false, message: "Already registered" };
    }

    if (!contest.registrations) contest.registrations = [];

    const tName = teamName || cpUser.cfHandle || "unknown";

    if (contest.teamSize > 1) {
      const teamMembers = contest.registrations.filter((r: any) => r.teamName === tName);
      if (teamMembers.length >= contest.teamSize) {
        return { success: false, message: "Team is already full." };
      }
    } else {
      // For solo, ensure no duplicate team name
      const teamExists = contest.registrations.some((r: any) => r.teamName === tName);
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

export async function getAvailableTeamsForContest(contestId: string): Promise<{ teamName: string; memberCount: number; maxCapacity: number }[]> {
  try {
    await dbConnect();
    const contest = await CustomContest.findById(contestId).lean();
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
        maxCapacity: contest.teamSize
      }));

    return availableTeams;
  } catch (error) {
    console.error("Error fetching available teams:", error);
    return [];
  }
}

import { reconciliationQueue } from "@/lib/bullmq";
import mongoose from "mongoose";

export async function createRoomContest(data: any): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, error: "Unauthorized" };

    await dbConnect();
    const cpUser = await CPUser.findOne({ userId });
    if (!cpUser) return { success: false, error: "CP Profile not found" };

    const start = new Date(data.startTime);
    // Registration deadline is 1 minute before start time
    const deadline = new Date(start.getTime() - 1 * 60000);
    
    // Validate start time is at least 2 minutes from now (1 min registration + 1 min buffer)
    if (start.getTime() < Date.now() + 2 * 60000 - 5000) { // 5s grace period
      return { success: false, error: "Start time must be strictly at least 2 minutes ahead of current time" };
    }

    // Format-specific backend validations and overrides
    let { maxParticipants, teamSize, format } = data;
    
    if (format === "1v1") {
      teamSize = 1;
      maxParticipants = 2;
    } else if (format === "solo-tournament") {
      teamSize = 1;
      if (maxParticipants < 2) return { success: false, error: "At least 2 participants required." };
    } else if (format === "team-tournament") {
      teamSize = 3;
      if (maxParticipants < 6) return { success: false, error: "Team battles require at least 6 participants." };
      if (maxParticipants % 3 !== 0) return { success: false, error: "Team battle participants must be a multiple of 3." };
    }

    let problemSlots: any[] = [];
    if (data.problemSelectionMode === "fine-tuned" && Array.isArray(data.fineTunedProblems)) {
      problemSlots = data.fineTunedProblems.map((id: string) => ({
        platform: "codeforces",
        problemId: id.trim()
      }));
    }

    const contest = new CustomContest({
      name: data.name,
      description: data.description,
      creatorId: cpUser._id,
      startTime: start,
      format: format,
      mode: data.mode || "blitz",
      status: "registration",
      teamSize: teamSize,
      problemSelectionMode: data.problemSelectionMode,
      bulkPlatform: "codeforces",
      bulkRatingMin: data.bulkRatingMin,
      bulkRatingMax: data.bulkRatingMax,
      bulkProblemCount: data.bulkProblemCount,
      problemSlots: problemSlots.length > 0 ? problemSlots : undefined,
      registrationSettings: {
        type: "open",
        deadline: deadline,
        maxParticipants: maxParticipants,
      },
      registrations: []
    });

    if (data.selfRegister) {
      contest.registrations.push({
        userId: cpUser.userId,
        cfHandle: cpUser.cfHandle || "unknown",
        teamName: data.selfTeamName || cpUser.cfHandle || "unknown",
        registeredAt: new Date(),
      });
    }

    await contest.save();

    // Schedule the check_start job
    const delay = Math.max(0, deadline.getTime() - Date.now());
    await reconciliationQueue.add("check_start", { contestId: contest._id.toString() }, { delay });

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
    const contest = await CustomContest.findById(contestId).lean();
    if (!contest) return { success: false, error: "Contest not found" };

    const User = (await import("@/models/User")).default;
    const userIds = (contest.registrations || []).map((r: any) => r.userId);
    const users = await User.find({ _id: { $in: userIds } }, "image").lean();
    const imageMap: Record<string, string> = {};
    users.forEach((u: any) => {
      if (u.image) imageMap[u._id.toString()] = u.image;
    });

    const populatedRegistrations = (contest.registrations || []).map((r: any) => ({
      ...r,
      image: imageMap[r.userId.toString()] || null
    }));

    return {
      success: true,
      format: contest.format,
      teamSize: contest.teamSize,
      registrations: JSON.parse(JSON.stringify(populatedRegistrations)),
    };
  } catch (error) {
    console.error("Error fetching contest registrations:", error);
    return { success: false, error: "Failed to fetch registrations" };
  }
}

export async function unregisterFromContest(contestId: string): Promise<{ success: boolean; message: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, message: "Unauthorized" };

    await dbConnect();
    
    const contest = await CustomContest.findById(contestId);
    if (!contest) return { success: false, message: "Contest not found" };

    if (contest.status !== "registration") {
      return { success: false, message: "Cannot unregister after registration has closed." };
    }

    if (!contest.registrations) return { success: false, message: "Not registered" };

    const initialLength = contest.registrations.length;
    contest.registrations = contest.registrations.filter((r: any) => r.userId.toString() !== userId);

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
