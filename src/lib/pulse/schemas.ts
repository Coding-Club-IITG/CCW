import { z } from "zod";

import { objectIdParamsSchema, paginationQueryFields } from "@/lib/api/schemas/boundary";
import { normalizeEmail, providerForEmail } from "@/lib/authPolicy";
import {
  PULSE_HOST_ROLES,
  PULSE_QUIZ_DEFAULT_STATUS,
  PULSE_QUIZ_STATUSES,
  ROOM_CODE_PATTERN,
} from "@/lib/pulse/constants";
import {
  checkConfig,
  pulseDeliverySchema,
  pulseRegistrationSchema,
  pulseSettingsSchema,
  pulseSlideSchema,
} from "@/lib/pulse/deckSchemas";

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
  delivery: pulseDeliverySchema.prefault({}),
  registration: pulseRegistrationSchema.prefault({}),
  settings: pulseSettingsSchema.prefault({}),
  slides: z.array(pulseSlideSchema).default([]),
  deckVersion: z.number().int().min(0).default(0),
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
    token: z.string().nullable().default(null),
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
  // Delivery, registration, timer and scoring compatibility: the same rules as the deck editor.
  checkConfig(quiz, (path, message) => ctx.addIssue({ code: "custom", path, message }));
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
  /** Past quiz whose configuration (never its slides) seeds the new quiz. */
  copyConfigFrom: objectId.optional(),
});
export const pulseCoHostSchema = z.strictObject({ email: pulseHostEmailSchema });
export const pulseQuizQuerySchema = z.strictObject({
  ...paginationQueryFields,
  status: z.enum(PULSE_QUIZ_STATUSES).optional(),
});

export const pulseLockTokenSchema = z.strictObject({ lockToken: z.string().regex(/^[0-9a-f]{32}$/, "Invalid lock token.") });
export const pulseSaveDeckSchema = z.object({
  deckVersion: z.number().int().min(0),
  lockToken: z.string().regex(/^[0-9a-f]{32}$/, "Invalid lock token."),
  // Validated against pulseDeckSchema after the lock check; unknown top-level keys
  // (ownerId, role, editorLock...) are ignored.
  slides: z.array(z.unknown()),
  delivery: z.unknown(),
  registration: z.unknown(),
  settings: z.unknown(),
});
