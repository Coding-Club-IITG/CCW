"use server";

import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import CustomContest from "@/models/CustomContest";
import ContestPreset from "@/models/ContestPreset";
import mongoose from "mongoose";

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
    } else {
      await dbConnect();
      const preset = await ContestPreset.findById(data.presetId);
      if (!preset) {
        errors.presetId = "Selected preset does not exist";
      } else if (preset.archived) {
        errors.presetId = "Selected preset is archived";
      }
    }
  }

  if (step === 4) {
    if (data.thirdPlacePlayoff === undefined) {
      errors.thirdPlacePlayoff = "Third-place playoff setting is required";
    }
    if (data.seedingMethod !== "cf_rating" && data.seedingMethod !== "manual") {
      errors.seedingMethod = "Seeding method must be cf_rating or manual";
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
  let step4 = await validateStep(4, data);

  if (!step1.valid || !step2.valid || !step3.valid || !step4.valid) {
    return { error: "Invalid form data submission" };
  }

  await dbConnect();

  // Fetch preset to pull the problem selection mode and other options
  const preset = await ContestPreset.findById(data.presetId);
  if (!preset) return { error: "Selected preset does not exist" };

  try {
    const contest = await CustomContest.create({
      name: data.name.trim(),
      description: data.description?.trim(),
      creatorId: new mongoose.Types.ObjectId(user.id),
      format: "bracket",
      mode: data.mode,
      status: "draft",
      teamSize: data.teamSize,
      presetId: preset._id,
      problemSelectionMode: preset.problemSelectionMode,
      bulkPlatform: preset.bulkPlatform,
      bulkRatingMin: preset.bulkRatingMin,
      bulkRatingMax: preset.bulkRatingMax,
      bulkProblemCount: preset.bulkProblemCount,
      problemSlots: preset.problemSlots,
      registrations: [],
      registrationSettings: {
        type: data.registrationType,
        deadline: new Date(data.deadline),
        maxParticipants: Number(data.maxParticipants),
      },
      bracketSettings: {
        thirdPlacePlayoff: !!data.thirdPlacePlayoff,
        seedingMethod: data.seedingMethod,
      },
    });

    return { contestId: contest._id.toString() };
  } catch (err: any) {
    return { error: err.message || "Failed to create contest" };
  }
}
