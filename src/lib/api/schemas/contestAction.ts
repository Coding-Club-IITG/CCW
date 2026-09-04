import { z } from "zod";

import { objectIdStringSchema } from "@/lib/api/schemas/contestRoute";

export const contestModeSchema = z.enum(["blitz", "arena"]);
export const contestFormatSchema = z.enum([
  "1v1",
  "solo-tournament",
  "team-tournament",
  "bracket",
]);
export const contestRegistrationTypeSchema = z.enum(["open", "closed"]);
export const contestProblemSelectionModeSchema = z.enum(["bulk", "fine-tuned"]);
export const contestSeedingMethodSchema = z.enum(["cf_rating", "manual"]);

const dateStringSchema = z
  .string()
  .refine(
    (value) => Number.isFinite(new Date(value).getTime()),
    "Must be a valid date",
  );

export const contestRegisteredUserSchema = z.object({
  id: objectIdStringSchema,
  cfHandle: z.string().trim().min(1).max(100).optional(),
  teamName: z.string().trim().min(1).max(200).optional(),
});

export const contestProblemSlotSchema = z.object({
  platform: z.string().trim().min(1).max(50),
  problemId: z.string().trim().min(1).max(100),
  roundNumber: z.number().int().min(1).optional(),
  points: z.number().int().min(1).max(10000).optional(),
  timeLimitMinutes: z.number().int().min(1).max(300).optional(),
});

const contestCreationFields = {
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).default(""),
  mode: contestModeSchema,
  format: contestFormatSchema.default("bracket"),
  teamSize: z.union([z.literal(1), z.literal(3)]),
  maxParticipants: z.number().int().min(2),
  startTime: dateStringSchema,
  registrationType: contestRegistrationTypeSchema,
  registrationStartTime: dateStringSchema.optional(),
  problemSelectionMode: contestProblemSelectionModeSchema.default("bulk"),
  bulkPlatform: z.string().trim().min(1).max(50).default("codeforces"),
  bulkRatingMin: z.number().int().min(0).max(5000).optional(),
  bulkRatingMax: z.number().int().min(0).max(5000).optional(),
  bulkProblemCount: z.number().int().min(1).max(100).optional(),
  bulkMinContestId: z.number().int().min(0).optional(),
  fineTunedProblems: z.array(z.string().trim().min(1).max(100)).optional(),
  problemSlots: z.array(contestProblemSlotSchema).max(100).default([]),
  presetId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.union([objectIdStringSchema, z.literal("custom")]).optional(),
  ),
  bracketType: z
    .enum(["single_elimination", "double_elimination"])
    .default("single_elimination"),
  overallDurationMinutes: z.number().int().min(1).max(600).optional(),
  perProblemDurationMinutes: z.number().int().min(1).max(120).optional(),
  thirdPlacePlayoff: z.boolean().default(false),
  seedingMethod: contestSeedingMethodSchema.default("cf_rating"),
  registeredUsers: z.array(contestRegisteredUserSchema).max(256).default([]),
};

export const contestCreationPayloadSchema = z.object(contestCreationFields);
export const contestCreationDraftSchema = z
  .object({
    ...contestCreationFields,
    startTime: z.union([dateStringSchema, z.literal("")]),
  })
  .partial();

export type ContestCreationPayload = z.infer<
  typeof contestCreationPayloadSchema
>;
export type ContestCreationDraft = z.infer<typeof contestCreationDraftSchema>;
export type ContestRegisteredUser = z.infer<typeof contestRegisteredUserSchema>;
export type ContestProblemSlot = z.infer<typeof contestProblemSlotSchema>;

export type BracketContestInput = Pick<
  ContestCreationPayload,
  | "teamSize"
  | "maxParticipants"
  | "registrationType"
  | "registeredUsers"
  | "seedingMethod"
>;

export type BracketInputValidationResult =
  { success: true } | { success: false; error: string };

export function validateBracketContestInput(
  data: BracketContestInput,
): BracketInputValidationResult {
  const { teamSize, maxParticipants, registrationType, seedingMethod } = data;

  if (teamSize === 3 && maxParticipants < teamSize * 2) {
    return {
      success: false,
      error: "Team brackets require capacity for at least two complete teams.",
    };
  }
  if (maxParticipants % teamSize !== 0) {
    return {
      success: false,
      error: `Maximum participants must be divisible by the team size (${teamSize}).`,
    };
  }

  const registeredUsers = data.registeredUsers ?? [];
  if (registeredUsers.length > maxParticipants) {
    return {
      success: false,
      error: "Registered users cannot exceed the participant limit.",
    };
  }

  const userIds = registeredUsers.map((user) => user.id);
  if (new Set(userIds).size !== userIds.length) {
    return {
      success: false,
      error: "Each registered user may appear only once.",
    };
  }

  if (registrationType === "closed") {
    if (registeredUsers.length < teamSize * 2) {
      return {
        success: false,
        error:
          teamSize === 1
            ? "Closed brackets require at least 2 participants."
            : "Closed team brackets require at least two complete teams.",
      };
    }

    if (teamSize > 1) {
      const teamCounts = new Map<string, number>();
      for (const user of registeredUsers) {
        const teamName = user.teamName?.trim();
        if (!teamName) {
          return {
            success: false,
            error: "Every registered team member must have a team name.",
          };
        }
        teamCounts.set(teamName, (teamCounts.get(teamName) ?? 0) + 1);
      }
      if ([...teamCounts.values()].some((count) => count !== teamSize)) {
        return {
          success: false,
          error: `Every team must contain exactly ${teamSize} members.`,
        };
      }
    }
  } else if (registeredUsers.length > 0) {
    return {
      success: false,
      error: "Open brackets cannot include pre-registered users.",
    };
  }

  if (seedingMethod !== "cf_rating" && seedingMethod !== "manual") {
    return {
      success: false,
      error: "Seeding method must be either 'cf_rating' or 'manual'.",
    };
  }

  return { success: true };
}
