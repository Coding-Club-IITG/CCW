"use server";

import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import CustomContest from "@/models/CustomContest";
import ContestPreset from "@/models/ContestPreset";
import mongoose from "mongoose";
import User from "@/models/User";
import CPUser from "@/models/CPUser";
import { reconciliationQueue } from "@/lib/bullmq";

export async function validateStep(step: number, data: Record<string, any>) {
  const errors: Record<string, string> = {};

  if (step === 1) {
    if (!data.name || data.name.trim().length < 3) {
      errors.name = "Name must be at least 3 characters";
    } else if (data.name.trim().length > 100) {
      errors.name = "Name must be at most 100 characters";
    }
    if (data.description && data.description.length > 500) {
      errors.description = "Description must be at most 500 characters";
    }
    if (data.mode !== "blitz" && data.mode !== "arena") {
      errors.mode = "Mode must be blitz or arena";
    }
    if (data.teamSize !== 1 && data.teamSize !== 3) {
      errors.teamSize = "Team size must be 1 or 3";
    }
  }

  if (step === 2) {
    if (data.registrationType !== "open" && data.registrationType !== "closed") {
      errors.registrationType = "Registration type must be open or closed";
    }
    if (!data.deadline) {
      errors.deadline = "Registration deadline is required";
    } else {
      const deadlineDate = new Date(data.deadline);
      if (isNaN(deadlineDate.getTime())) {
        errors.deadline = "Invalid date format";
      } else if (deadlineDate.getTime() <= Date.now()) {
        errors.deadline = "Deadline must be in the future";
      }
    }
    if (!data.maxParticipants || isNaN(Number(data.maxParticipants))) {
      errors.maxParticipants = "Max participants is required and must be a number";
    } else if (Number(data.maxParticipants) < 2) {
      errors.maxParticipants = "Minimum 2 participants required";
    }
  }

  if (step === 3) {
    if (!data.presetId) {
      errors.presetId = "Please select a match preset";
    } else if (data.presetId !== "custom") {
      await dbConnect();
      const preset = await ContestPreset.findById(data.presetId);
      if (!preset) {
        errors.presetId = "Selected preset does not exist";
      } else if (preset.archived) {
        errors.presetId = "Selected preset is archived";
      }
    }
  }

  if (step === 4 || step === 5) {
    if (data.thirdPlacePlayoff !== undefined) {
      if (data.seedingMethod && data.seedingMethod !== "cf_rating" && data.seedingMethod !== "manual") {
        errors.seedingMethod = "Seeding method must be cf_rating or manual";
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export async function createBracketContest(data: any) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return { error: "Unauthorized" };

  const user = session.user as any;
  if (!isAdmin(user.role)) return { error: "Forbidden" };

  // Re-run validation server-side for safety
  let step1 = await validateStep(1, data);
  let step2 = await validateStep(2, data);
  let step3 = await validateStep(3, data);

  if (!step1.valid || !step2.valid || !step3.valid) {
    return { error: "Invalid form data submission" };
  }

  await dbConnect();

  let presetId = undefined;
  let problemSelectionMode = data.problemSelectionMode;
  let bulkPlatform = data.bulkPlatform || "codeforces";
  let bulkRatingMin = data.bulkRatingMin;
  let bulkRatingMax = data.bulkRatingMax;
  let bulkProblemCount = data.bulkProblemCount;
  let problemSlots: any[] = [];

  if (data.presetId === "custom") {
    if (problemSelectionMode === "fine-tuned" && Array.isArray(data.fineTunedProblems)) {
      problemSlots = data.fineTunedProblems.map((id: string) => ({
        platform: "codeforces",
        problemId: id.trim()
      })).filter((slot: any) => slot.problemId !== "");
    }
  } else {
    const preset = await ContestPreset.findById(data.presetId);
    if (!preset) return { error: "Selected preset does not exist" };
    presetId = preset._id;
    problemSelectionMode = preset.problemSelectionMode;
    bulkPlatform = preset.bulkPlatform;
    bulkRatingMin = preset.bulkRatingMin;
    bulkRatingMax = preset.bulkRatingMax;
    bulkProblemCount = data.bulkProblemCount || preset.bulkProblemCount;
    problemSlots = (data.problemSlots && data.problemSlots.length > 0) ? data.problemSlots : preset.problemSlots;
  }

  try {
    const deadlineStr = process.env.REGISTRATION_DEADLINE_MINUTES;
    if (!deadlineStr) {
      throw new Error("REGISTRATION_DEADLINE_MINUTES is not set in environment variables.");
    }
    const deadlineMinutes = parseInt(deadlineStr, 10);
    if (isNaN(deadlineMinutes)) {
      throw new Error("REGISTRATION_DEADLINE_MINUTES must be a valid number.");
    }
    const contest = await CustomContest.create({
      name: data.name.trim(),
      description: data.description?.trim(),
      creatorId: new mongoose.Types.ObjectId(user.id),
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
        startTime: data.registrationStartTime ? new Date(data.registrationStartTime) : undefined,
        deadline: new Date(new Date(data.startTime).getTime() - deadlineMinutes * 60000), // strictly before based on ENV
        maxParticipants: Number(data.maxParticipants),
      },
      bracketSettings: {
        thirdPlacePlayoff: !!data.thirdPlacePlayoff,
        seedingMethod: data.seedingMethod,
      },
    });

    // Handle scheduling based on registrationStartTime and deadline
    const now = Date.now();
    const regStartTime = data.registrationStartTime ? new Date(data.registrationStartTime).getTime() : now;
    const deadlineTime = contest.registrationSettings!.deadline!.getTime();
    
    // Validate registration starts before it ends (only for open registration)
    if (data.registrationType !== "closed" && regStartTime >= deadlineTime) {
      await CustomContest.findByIdAndDelete(contest._id);
      return { error: "Registration start time must be before the deadline." };
    }
    
    // Only handle start_registration scheduling for open contests
    if (data.registrationType !== "closed") {
      // If registration is in the future, schedule start_registration
      if (regStartTime > now) {
        await reconciliationQueue.add(
          "start_registration", 
          { contestId: contest._id.toString() }, 
          { delay: regStartTime - now }
        );
      } else {
        // If immediate, switch status to registration
        contest.status = "registration";
        await contest.save();
      }
    } else {
      // If closed, we skip the registration phase and go straight to draft.
      // The bracket generation will still happen via end_registration at the deadline.
      contest.status = "draft";
      await contest.save();
    }

    // Schedule end_registration at deadline (Bracket ONLY)
    if (deadlineTime > now) {
      await reconciliationQueue.add(
        "end_registration",
        { contestId: contest._id.toString() },
        { delay: deadlineTime - now }
      );
      
      // Also schedule the traditional check_start for brackets?
      // Actually, for bracket tournaments, the end_registration job will generate the bracket.
      // But standard workflow still expects check_start to be fired at the same time to process the first round.
      await reconciliationQueue.add(
        "check_start",
        { contestId: contest._id.toString() },
        { delay: deadlineTime - now }
      );
    }

    return { contestId: contest._id.toString() };
  } catch (err: any) {
    return { error: err.message || "Failed to create contest" };
  }
}

export async function searchVerifiedUsers(query: string) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return { error: "Unauthorized" };

  const user = session.user as any;
  if (!isAdmin(user.role)) return { error: "Forbidden" };

  if (!query || query.length < 2) return { users: [] };

  await dbConnect();
  
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const users = await User.find({ name: { $regex: escapedQuery, $options: "i" } })
    .select("_id name image")
    .limit(20)
    .lean();
    
  if (users.length === 0) return { users: [] };
  
  const userIds = users.map((u: any) => u._id);
  
  // Find which of these users are CPUsers with verified handles
  const cpUsers = await CPUser.find({ 
    userId: { $in: userIds }, 
    cfHandle: { $ne: "" } 
  }).select("userId cfHandle cfRating").lean();
  
  const cpUserMap = new Map();
  for (const c of cpUsers) {
    cpUserMap.set(c.userId.toString(), { cfHandle: c.cfHandle, cfRating: c.cfRating });
  }
  
  const result = users
    .filter((u: any) => cpUserMap.has(u._id.toString()))
    .map((u: any) => {
      const cpData = cpUserMap.get(u._id.toString());
      return {
        id: u._id.toString(),
        name: u.name,
        image: u.image,
        cfHandle: cpData.cfHandle,
        cfRating: cpData.cfRating || 0
      };
    });
    
  return { users: result };
}
