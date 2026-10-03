import { z } from "zod";

import { objectIdStringSchema } from "@/lib/api/schemas/contestRoute";

const id = objectIdStringSchema.transform((value) => value.toLowerCase());
export const contestRegistrationIdSchema = id;
export const contestTeamNameSchema = z.string().trim().min(1).max(200);

export const contestRegistrationSchema = z.object({
  contestId: id,
  teamName: z.preprocess(
    (value) => (value === "" ? undefined : value),
    contestTeamNameSchema.optional(),
  ),
  isPublic: z.boolean().optional(),
});

export const contestTeamTargetSchema = z.object({ contestId: id, teamId: id });
export const contestTeamInviteSchema = contestTeamTargetSchema.extend({
  cfHandle: z.string().trim().min(1).max(100),
});
export const contestTeamResponseSchema = z.object({
  requestId: id,
  action: z.enum(["accept", "reject"]),
});

export const contestTeamRegistrationSchema = z.object({
  teamName: contestTeamNameSchema,
  memberIds: z
    .array(id)
    .length(3)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Each member may appear only once.",
    ),
});
