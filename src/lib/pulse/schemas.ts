import { z } from "zod";

import { objectIdParamsSchema, paginationQueryFields } from "@/lib/api/schemas/boundary";
import { normalizeEmail, providerForEmail } from "@/lib/authPolicy";
import {
  PULSE_DEFAULT_ALLOW_LATE_JOIN,
  PULSE_DEFAULT_MAX_PARTICIPANTS,
  PULSE_DELIVERY_MODES,
  PULSE_HOST_ROLES,
  PULSE_NAVIGATION_MODES,
  PULSE_QUIZ_DEFAULT_STATUS,
  PULSE_QUIZ_STATUSES,
  PULSE_SLIDE_TYPES,
  ROOM_CODE_PATTERN,
} from "@/lib/pulse/constants";

const objectId = objectIdParamsSchema.shape.id;
const nullableDate = z.date().nullable().default(null);
const nullableId = objectId.nullable().default(null);

export const pulseHostAssignmentSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.email()),
  role: z.enum(PULSE_HOST_ROLES),
  userId: objectId.nullish(),
  linkedAt: z.date().nullish(),
  assignedBy: objectId,
  assignedAt: z.date().default(() => new Date()),
});

// Server-side draft input; IDs are strings and timestamps are Date values.
// Browser responses use explicit DTOs rather than this full database shape.
export const pulseQuizSchema = z.object({
  title: z.string().trim().max(200).default(""),
  status: z.enum(PULSE_QUIZ_STATUSES).default(PULSE_QUIZ_DEFAULT_STATUS),
  roomCode: z.string().trim().toUpperCase().regex(ROOM_CODE_PATTERN),
  ownerId: nullableId,
  coHostIds: z.array(objectId).default([]),
  hostAssignments: z.array(pulseHostAssignmentSchema).default([]),
  schedule: z.object({
    scheduledAt: nullableDate,
    timezone: z.string().default("Asia/Kolkata"),
  }).prefault({}),
  delivery: z.object({
    mode: z.enum(PULSE_DELIVERY_MODES).default("host-paced"),
    navigation: z.enum(PULSE_NAVIGATION_MODES).default("sequential"),
    displayMode: z.string().default("full-prompt"),
  }).prefault({}),
  registration: z.object({
    allowIITGAccounts: z.boolean().default(true),
    allowGuests: z.boolean().default(false),
    maxParticipants: z.number().int().min(1).default(PULSE_DEFAULT_MAX_PARTICIPANTS),
    allowLateJoin: z.boolean().default(PULSE_DEFAULT_ALLOW_LATE_JOIN),
  }).prefault({}),
  settings: z.object({
    timer: z.object({
      overallEnabled: z.boolean().default(true),
      overallDurationSeconds: z.number().int().min(1).default(3600),
      perQuestionEnabled: z.boolean().default(true),
    }).prefault({}),
    reveal: z.object({
      showCorrectAnswer: z.boolean().default(false),
      showParticipantScore: z.boolean().default(false),
      showAnswerReview: z.boolean().default(false),
    }).prefault({}),
    randomization: z.object({
      enabled: z.boolean().default(false),
      randomizeQuestions: z.boolean().default(false),
      randomizeOptions: z.boolean().default(false),
    }).prefault({}),
    leaderboard: z.object({
      enabled: z.boolean().default(true),
      showAfterQuestions: z.array(z.string()).default([]),
      showManually: z.boolean().default(true),
      showAtEnd: z.boolean().default(true),
    }).prefault({}),
  }).prefault({}),
  slides: z.array(z.object({
    slideId: z.string().min(1),
    order: z.number().int().min(0),
    type: z.enum(PULSE_SLIDE_TYPES),
    content: z.record(z.string(), z.unknown()).default({}),
  })).default([]),
  presenter: z.object({
    activePresenterId: nullableId,
    claimedAt: nullableDate,
    viewMode: z.enum(["selected_slide", "overview"]).default("selected_slide"),
    selectedSlideId: z.string().nullable().default(null),
  }).prefault({}),
  editorLock: z.object({
    lockedBy: nullableId,
    lockedAt: nullableDate,
    expiresAt: nullableDate,
  }).prefault({}),
  participantCount: z.number().int().min(0).default(0),
  checkpoint: z.object({
    lastCompletedSlideIndex: z.number().int().min(-1).default(-1),
    lastCheckpointAt: nullableDate,
  }).prefault({}),
  timestamps: z.object({
    lobbyOpenedAt: nullableDate,
    startedAt: nullableDate,
    timedOutAt: nullableDate,
    completedAt: nullableDate,
    cancelledAt: nullableDate,
    archivedAt: nullableDate,
  }).prefault({}),
}).superRefine((quiz, ctx) => {
  const owners = quiz.hostAssignments.filter((host) => host.role === "owner");
  if (owners.length > 1 || (!quiz.ownerId && owners.length !== 1))
    ctx.addIssue({ code: "custom", path: ["hostAssignments"], message: "A quiz requires one owner." });
  if (new Set(quiz.hostAssignments.map((host) => host.email)).size !== quiz.hostAssignments.length)
    ctx.addIssue({ code: "custom", path: ["hostAssignments"], message: "Duplicate host emails are not allowed." });
  if (owners[0]?.userId && owners[0].userId !== quiz.ownerId)
    ctx.addIssue({ code: "custom", path: ["ownerId"], message: "Owner ID must match the owner assignment." });
  if (quiz.delivery.mode === "participant-paced" && quiz.settings.timer.perQuestionEnabled)
    ctx.addIssue({ code: "custom", path: ["settings", "timer", "perQuestionEnabled"], message: "Per-question timers are only supported in host-paced mode." });
});

export type PulseQuizInput = z.input<typeof pulseQuizSchema>;
export type PulseQuizData = z.output<typeof pulseQuizSchema>;
export type PulseHostAssignment = z.output<typeof pulseHostAssignmentSchema>;

export const pulseHostEmailSchema = z.string().transform(normalizeEmail)
  .pipe(z.email().max(128))
  .refine((email) => providerForEmail(email) === "microsoft", "Use an @iitg.ac.in email address.");
export const createPulseQuizSchema = z.strictObject({
  title: z.string().trim().min(1).max(200),
  ownerEmail: pulseHostEmailSchema,
});
export const pulseCoHostSchema = z.strictObject({ email: pulseHostEmailSchema });
export const pulseQuizQuerySchema = z.strictObject({
  ...paginationQueryFields,
  status: z.enum(PULSE_QUIZ_STATUSES).optional(),
});
