"use server";

import { err as appError, ok, validationError } from "@/lib/api/result";

import { defineAction } from "@/lib/actions/defineAction";

export const validateStep = defineAction("validateStep", validateStepAction);
export const createBracketContest = defineAction(
  "createBracketContest",
  createBracketContestAction,
);

import { auth } from "@/lib/auth";
import { isHead } from "@/lib/access/roles";
import { headers } from "next/headers";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import ContestMatch from "@/models/ContestMatch";
import ContestPreset from "@/models/ContestPreset";
import mongoose from "mongoose";
import CPUser from "@/models/CPUser";
import { reconciliationQueue } from "@/lib/contests/queues";
import { errorToLogMetadata, logger } from "@/lib/utils";
import {
  contestCreationDraftSchema,
  contestCreationPayloadSchema,
  type ContestProblemSlot,
} from "@/lib/api/schemas/contestAction";

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

  return ok({ valid: Object.keys(errors).length === 0, errors });
}

async function createBracketContestAction(input: unknown) {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  if (!session) return appError("UNAUTHENTICATED", "Unauthorized");

  const user = session.user;
  if (!isHead(user.access)) return appError("FORBIDDEN", "Forbidden");

  const parsed = contestCreationPayloadSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  // Re-run validation server-side for safety
  const step1 = await validateStepAction(1, data);
  const step2 = await validateStepAction(2, data);
  const step3 = await validateStepAction(3, data);
  const step4 = await validateStepAction(4, data);
  const step5 = await validateStepAction(5, data);

  if (!step1.ok) return step1;
  if (!step2.ok) return step2;
  if (!step3.ok) return step3;
  if (!step4.ok) return step4;
  if (!step5.ok) return step5;

  if (
    !step1.data.valid ||
    !step2.data.valid ||
    !step3.data.valid ||
    !step4.data.valid ||
    !step5.data.valid
  ) {
    return appError("VALIDATION_ERROR", "Invalid form data submission");
  }

  await dbConnect();

  let presetId = undefined;
  let problemSelectionMode = data.problemSelectionMode;
  let bulkPlatform = data.bulkPlatform || "codeforces";
  let bulkRatingMin = data.bulkRatingMin;
  let bulkRatingMax = data.bulkRatingMax;
  let bulkProblemCount = data.bulkProblemCount;
  let bulkMinContestId = data.bulkMinContestId;
  let problemSlots: ContestProblemSlot[] = [];

  if (data.presetId === "custom") {
    if (problemSelectionMode === "fine-tuned") {
      if (!Array.isArray(data.problemSlots) || data.problemSlots.length === 0) {
        return appError(
          "VALIDATION_ERROR",
          "Fine-tuned problem slots with round assignments are required for a bracket contest.",
        );
      }
      // Per-round bracket fine-tuned: problemSlots already has roundNumber set by the UI
      problemSlots = data.problemSlots.filter(
        (slot) => slot.problemId.trim() !== "",
      );

      if (problemSlots.length === 0) {
        return appError("INTERNAL_ERROR", "An unexpected error occurred.");
      }
    }
  } else {
    const preset = await ContestPreset.findById(data.presetId);
    if (!preset) return appError("NOT_FOUND", "Selected preset does not exist");
    presetId = preset._id;
    problemSelectionMode = preset.problemSelectionMode ?? "bulk";
    bulkPlatform = preset.bulkPlatform ?? "codeforces";
    bulkRatingMin = preset.bulkRatingMin;
    bulkRatingMax = preset.bulkRatingMax;
    bulkProblemCount = data.bulkProblemCount || preset.bulkProblemCount;
    bulkMinContestId = data.bulkMinContestId ?? preset.bulkMinContestId;
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
  }

  try {
    const cpUser = await CPUser.findOne({ userId: user.id });
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
      bulkMinContestId: bulkMinContestId,
      problemSlots: problemSlots,
      registrations: data.registeredUsers.map((registeredUser) => ({
        userId: new mongoose.Types.ObjectId(registeredUser.id),
        cfHandle: registeredUser.cfHandle,
        teamName: registeredUser.teamName,
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
      return appError(
        "VALIDATION_ERROR",
        "Registration start time must be before the deadline.",
      );
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

    return ok({ contestId: contest._id.toString() });
  } catch (err) {
    logger.error("Admin contest creation failed", {
      action: "createContest",
      ...errorToLogMetadata(err),
    });
    return appError("INTERNAL_ERROR", "An unexpected error occurred.");
  }
}
