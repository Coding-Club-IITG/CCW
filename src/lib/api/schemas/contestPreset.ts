import { z } from "zod";

const problemSlotSchema = z.object({
  platform: z.string().trim().min(1).max(50),
  rating: z.number().int().min(0).max(5000),
});

const presetFields = {
  description: z.string().trim().max(2_000).optional(),
  format: z
    .enum(["1v1", "solo-tournament", "team-tournament", "bracket"])
    .optional(),
  mode: z.enum(["blitz", "arena"]).optional(),
  durationSeconds: z.number().int().min(1).max(86_400).optional(),
  problemSelectionMode: z.enum(["bulk", "fine-tuned"]).optional(),
  bulkPlatform: z.string().trim().min(1).max(50).optional(),
  bulkRatingMin: z.number().int().min(0).max(5000).optional(),
  bulkRatingMax: z.number().int().min(0).max(5000).optional(),
  bulkProblemCount: z.number().int().min(1).max(100).optional(),
  bulkMinContestId: z.number().int().min(0).optional(),
  problemSlots: z.array(problemSlotSchema).max(100).optional(),
};

export const createContestPresetSchema = z.object({
  name: z.string().trim().min(3).max(200),
  ...presetFields,
});

export const updateContestPresetSchema = z.object({
  name: z.string().trim().min(3).max(200).optional(),
  ...presetFields,
});

export const archiveContestPresetSchema = z.object({ archived: z.boolean() });

export const contestPresetParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "id must be a valid ObjectId"),
});

export const contestPresetQuerySchema = z.object({
  includeArchived: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional()
    .default(false),
});
