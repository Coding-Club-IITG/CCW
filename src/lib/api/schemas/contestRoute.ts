import { z } from "zod";

export const objectIdStringSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a valid ObjectId");

export const contestIdParamsSchema = z.object({ id: objectIdStringSchema });

export const createContestRoomSchema = z.object({
  contestId: objectIdStringSchema,
  teams: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        members: z.array(objectIdStringSchema).min(1).max(3),
      }),
    )
    .min(2),
});

export const contestStatusSchema = z.object({
  action: z.enum(["publish", "start", "complete"]),
});

export const teamRegistrationSchema = z.object({
  teamName: z.string().trim().min(1).max(200),
  memberIds: z.array(objectIdStringSchema).length(3),
});

export const contestSyncSchema = z.object({
  roomId: objectIdStringSchema,
  teamId: objectIdStringSchema.optional(),
  problemId: z.string().trim().min(1).max(100),
});

export const contestWalkoverSchema = z.object({
  winnerTeamId: objectIdStringSchema,
  note: z.string().trim().min(1).max(2_000),
});

export const contestStreamQuerySchema = z.object({
  contestId: objectIdStringSchema.optional(),
  roomId: objectIdStringSchema.optional(),
  rooms: objectIdStringSchema.optional(),
});
