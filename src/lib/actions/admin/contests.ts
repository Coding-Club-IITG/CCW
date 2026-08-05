"use server";

import { auth } from "@/lib/auth";
import { isHead } from "@/lib/roles";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import ContestMatch from "@/models/ContestMatch";
import ContestPreset from "@/models/ContestPreset";
import mongoose from "mongoose";
import CPUser from "@/models/CPUser";
import { reconciliationQueue } from "@/lib/bullmq";
import { errorToLogMetadata, logger } from "@/lib/utils";

export async function validateStep(step: number, data: Record<string, any>) {
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
      data.registrationType !== "open" &&
      data.registrationType !== "closed"
    ) {
      errors.registrationType = "Registration type must be open or closed";
    }
    if (!data.maxParticipants || isNaN(Number(data.maxParticipants))) {
      errors.maxParticipants =
        "Max participants is required and must be a number";
    } else if (Number(data.maxParticipants) < 2) {
      errors.maxParticipants = "Minimum 2 participants required";
    }
  }

  if (step === 3) {
    if (!data.presetId) {
      errors.presetId = "Please select a match preset";
    } else if (data.presetId !== "custom") {
      if (!mongoose.Types.ObjectId.isValid(data.presetId)) {
        errors.presetId = "Invalid preset ID format";
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
  }

  if (step === 4 || step === 5) {
    if (
      data.seedingMethod &&
      data.seedingMethod !== "cf_rating" &&
      data.seedingMethod !== "manual"
    ) {
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
  if (!isHead(user.access)) return { error: "Forbidden" };

  // Re-run validation server-side for safety
  let step1 = await validateStep(1, data);
  let step2 = await validateStep(2, data);
  let step3 = await validateStep(3, data);
  let step4 = await validateStep(4, data);
  let step5 = await validateStep(5, data);

  if (
    !step1.valid ||
    !step2.valid ||
    !step3.valid ||
    !step4.valid ||
    !step5.valid
  ) {
    return { error: "Invalid form data submission" };
  }

  await dbConnect();

  let presetId = undefined;
  let problemSelectionMode = data.problemSelectionMode;
  let bulkPlatform = data.bulkPlatform || "codeforces";
  let bulkRatingMin = data.bulkRatingMin;
  let bulkRatingMax = data.bulkRatingMax;
  let bulkProblemCount = data.bulkProblemCount;
  let bulkMinContestId = data.bulkMinContestId;
  let problemSlots: any[] = [];

  if (data.presetId === "custom") {
    if (problemSelectionMode === "fine-tuned") {
      if (!Array.isArray(data.problemSlots) || data.problemSlots.length === 0) {
        return {
          error:
            "Fine-tuned problem slots with round assignments are required for a bracket contest.",
        };
      }
      // Per-round bracket fine-tuned: problemSlots already has roundNumber set by the UI
      problemSlots = data.problemSlots.filter(
        (s: any) => s.problemId && s.problemId.trim() !== "",
      );

      if (problemSlots.length === 0) {
        return {
          error: "Please provide valid problem IDs for the bracket rounds.",
        };
      }
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
    bulkMinContestId = data.bulkMinContestId ?? preset.bulkMinContestId;
    problemSlots =
      data.problemSlots && data.problemSlots.length > 0
        ? data.problemSlots
        : preset.problemSlots;
  }

  try {
    const cpUser = await CPUser.findOne({ userId: user.id });
    if (!cpUser) return { error: "CP Profile not found" };

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
      bulkMinContestId: bulkMinContestId,
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
        ), // strictly before based on ENV
        maxParticipants: Number(data.maxParticipants),
      },
      bracketSettings: {
        thirdPlacePlayoff: !!data.thirdPlacePlayoff,
        seedingMethod: data.seedingMethod,
      },
    });

    // Handle scheduling based on registrationStartTime and deadline
    const now = Date.now();
    const regStartTime = data.registrationStartTime
      ? new Date(data.registrationStartTime).getTime()
      : now;
    const deadlineTime = contest.registrationSettings!.deadline!.getTime();

    // Validate registration starts before it ends (only for open registration)
    if (data.registrationType !== "closed" && regStartTime >= deadlineTime) {
      await ContestMatch.findByIdAndDelete(contest._id);
      return { error: "Registration start time must be before the deadline." };
    }

    // Only handle start_registration scheduling for open contests
    if (data.registrationType !== "closed") {
      // If registration is in the future, schedule start_registration
      if (regStartTime > now) {
        await reconciliationQueue.add(
          "start_registration",
          { contestId: contest._id.toString() },
          { delay: regStartTime - now },
        );
      } else {
        // If immediate, switch status to registration
        contest.status = "registration";
        await contest.save();
      }
    } else {
      // If closed, we skip the registration phase and go straight to provisioning.
      contest.status = "provisioning";
      await contest.save();

      // Invoke check_start immediately to generate the bracket
      await reconciliationQueue.add("check_start", {
        contestId: contest._id.toString(),
      });
    }

    // For open contests, schedule check_start at the deadline to handle provisioning
    if (data.registrationType !== "closed" && deadlineTime > now) {
      await reconciliationQueue.add(
        "check_start",
        { contestId: contest._id.toString() },
        { delay: deadlineTime - now },
      );
    }

    return { contestId: contest._id.toString() };
  } catch (err) {
    logger.error("Admin contest creation failed", {
      action: "createContest",
      ...errorToLogMetadata(err),
    });
    return { error: "Failed to create contest." };
  }
}
