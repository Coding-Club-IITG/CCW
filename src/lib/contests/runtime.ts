import { z } from "zod";

export const storedActivityEntrySchema = z.object({
  icon: z.string(),
  text: z.string(),
  color: z.string(),
  timestamp: z.number(),
  eventType: z.string(),
});
export type StoredActivityEntry = z.infer<typeof storedActivityEntrySchema>;

import { objectIdStringSchema } from "@/lib/api/schemas/contestRoute";

const optionalObjectId = objectIdStringSchema.optional().default("");

export const cfSyncJobDataSchema = z.object({
  roomId: objectIdStringSchema,
  userId: objectIdStringSchema,
  teamId: objectIdStringSchema,
  cfHandle: z.string().trim().min(1).max(100),
  problemId: z.string().trim().min(1).max(100),
});

export const nightlyProblemSyncJobDataSchema = z.object({
  isFirstRun: z.boolean().optional(),
});

export const reconciliationJobDataSchema = z.object({
  roomId: optionalObjectId,
  contestId: optionalObjectId,
  trigger: z
    .enum([
      "start_registration",
      "check_start",
      "activate_bracket",
      "start_waiting_room",
      "timeout",
      "completed",
      "disconnect",
      "forfeit",
    ])
    .optional()
    .default("completed"),
  forfeitedUserId: optionalObjectId,
  userId: optionalObjectId,
  teamId: optionalObjectId,
});

export const reconciliationJobNames = [
  "team_ready_timeout",
  "start_registration",
  "check_start",
  "activate_bracket",
  "start_waiting_room",
  "ready_timeout",
  "room_timeout",
  "room_completed",
  "mid_match_disconnect_timeout",
] as const;

export type CfSyncJobData = z.infer<typeof cfSyncJobDataSchema>;
export type NightlyProblemSyncJobData = z.infer<
  typeof nightlyProblemSyncJobDataSchema
>;
export type ReconciliationJobData = z.infer<typeof reconciliationJobDataSchema>;
export type ReconciliationJobInput = z.input<
  typeof reconciliationJobDataSchema
>;
export type ReconciliationJobName = (typeof reconciliationJobNames)[number];
export type CfSyncJobName = "cf_sync" | "nightly-cf-problem-sync";
export type CfSyncQueueData = CfSyncJobData | NightlyProblemSyncJobData;

export const contestRoomProblemSchema = z
  .object({
    problemId: z.string().min(1),
    points: z.number().optional(),
    revealedAt: z.number().nullable().optional(),
  })
  .passthrough();

export const contestRoomStateSchema = z
  .object({
    status: z.string().optional(),
    type: z.string().optional(),
    startTime: z.string().optional(),
    timeLimit: z.string().optional(),
    currentProblem: z.string().optional(),
    contestId: z.string().optional(),
  })
  .passthrough();

export const contestSubmissionEventSchema = z.object({
  userId: objectIdStringSchema,
  teamId: objectIdStringSchema,
  problemId: z.string().min(1),
  cfSubmissionId: z.number().int(),
  verdict: z.string().min(1),
  points: z.number(),
  solveMs: z.number().nonnegative(),
  cfTimestamp: z.number().positive(),
});

export type ContestRoomProblem = z.infer<typeof contestRoomProblemSchema>;
export type ContestRoomState = z.infer<typeof contestRoomStateSchema>;
export type ContestSubmissionEvent = z.infer<
  typeof contestSubmissionEventSchema
>;

const scoreMapSchema = z.record(z.string(), z.number());
const roomParticipantSchema = z.object({
  userId: z.string().min(1),
  teamId: z.string().min(1),
});
const synchronizedRoomStateSchema = contestRoomStateSchema;

const roomStateSyncEventSchema = z
  .object({
    type: z.literal("room.state_sync"),
    state: synchronizedRoomStateSchema,
    problems: z.array(contestRoomProblemSchema).optional(),
    scores: scoreMapSchema.optional(),
    locks: z.record(z.string(), z.string()).optional(),
    activityLog: z.array(storedActivityEntrySchema).optional(),
  })
  .passthrough();

export const roomEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("room.locked"),
      problemId: z.string().min(1),
      claimedBy: z.string().min(1),
      timestamp: z.number(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("room.score"),
      scores: scoreMapSchema,
    })
    .passthrough(),
  z
    .object({
      type: z.literal("room.end"),
      finalScores: scoreMapSchema.optional(),
      lastSolvedBy: roomParticipantSchema.optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("room.advance"),
      problemIndex: z.number().int().nonnegative(),
      nextProblem: contestRoomProblemSchema,
      solvedBy: roomParticipantSchema,
    })
    .passthrough(),
  z
    .object({
      type: z.literal("room.reclaimed"),
      teamId: z.string().min(1),
      problemId: z.string().min(1),
    })
    .passthrough(),
  roomStateSyncEventSchema,
  z
    .object({
      type: z.literal("room.user_ready"),
      userId: z.string().min(1),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("team.withdrawn"),
      teamId: z.string().min(1),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("presence.online"),
      userId: z.string().min(1),
      cancelledForfeit: z.boolean().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("presence.offline"),
      userId: z.string().min(1),
      forfeitTimeout: z.number().optional(),
    })
    .passthrough(),
]);

export const contestEventSchema = z
  .object({
    type: z.enum([
      "contest.bracket_update",
      "contest.round_complete",
      "contest.standing_update",
      "contest.status_change",
    ]),
  })
  .passthrough();

const typedUserEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("sync.queued"),
      problemId: z.string().min(1).optional(),
      position: z.number().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("sync.detected"),
      problemId: z.string().min(1).optional(),
      verdict: z.string().min(1),
      pointsAwarded: z.number().nullable().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("sync.success"),
      problemId: z.string().min(1).optional(),
      verdict: z.string().optional(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal("sync.failed"),
      problemId: z.string().min(1).optional(),
      verdict: z.string().optional(),
      reason: z.string().optional(),
    })
    .passthrough(),
  roomStateSyncEventSchema,
]);

export const userEventSchema = z.union([
  typedUserEventSchema,
  z
    .object({
      verdict: z.string(),
      reason: z.string(),
    })
    .passthrough(),
]);

export type RoomEvent = z.infer<typeof roomEventSchema>;
export type ContestEvent = z.infer<typeof contestEventSchema>;
export type UserEvent = z.infer<typeof userEventSchema>;
export type RoomStreamEvent =
  z.infer<typeof roomEventSchema> | z.infer<typeof typedUserEventSchema>;

export const roomStreamEventSchema = z.union([
  roomEventSchema,
  typedUserEventSchema,
]);

export function parseContestRoomProblems(values: readonly string[]) {
  return values.map((value) =>
    contestRoomProblemSchema.parse(JSON.parse(value)),
  );
}
