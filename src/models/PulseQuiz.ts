import mongoose from "mongoose";

import {
  PULSE_DECK_LIMITS,
  PULSE_DEFAULT_ALLOW_LATE_JOIN,
  PULSE_DEFAULT_MAX_PARTICIPANTS,
  PULSE_DEFAULT_SCORING_MODE,
  PULSE_DELIVERY_MODES,
  PULSE_DISPLAY_MODES,
  PULSE_HOST_ROLES,
  PULSE_NAVIGATION_MODES,
  PULSE_QUIZ_DEFAULT_STATUS,
  PULSE_QUIZ_STATUSES,
  PULSE_SCORING_MODES,
  PULSE_SLIDE_TYPES,
  ROOM_CODE_PATTERN,
  type PulseQuizStatus,
} from "@/lib/pulse/constants";
import { pulseConfigSchema, pulseSlideSchema } from "@/lib/pulse/deckSchemas";

const { Schema } = mongoose;
const { ObjectId, Mixed } = Schema.Types;

/* ---------- Nested schemas ---------- */

const HostAssignmentSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    role: { type: String, enum: PULSE_HOST_ROLES, required: true },
    // Filled in on the host's first IITG sign-in (pre-login email linking)
    userId: { type: ObjectId, ref: "User" },
    linkedAt: { type: Date },
    assignedBy: { type: ObjectId, ref: "User", required: true },
    assignedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

// Design-doc shape: type-specific fields live in `content`. The Zod deck schemas
// (lib/pulse/deckSchemas) are authoritative for validation; content stays Mixed.
const SlideSchema = new Schema(
  {
    slideId: { type: String, required: true },
    order: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: "Slide order must be a whole number." },
    },
    type: { type: String, enum: PULSE_SLIDE_TYPES, required: true },
    content: { type: Mixed, default: {} },
  },
  { _id: false },
);

const ScheduleSchema = new Schema(
  {
    scheduledAt: { type: Date, default: null },
    timezone: { type: String, default: "Asia/Kolkata" },
  },
  { _id: false },
);

const PresenterSchema = new Schema(
  {
    activePresenterId: { type: ObjectId, ref: "User", default: null },
    claimedAt: { type: Date, default: null },
    viewMode: {
      type: String,
      enum: ["selected_slide", "overview"],
      default: "selected_slide",
    },
    selectedSlideId: { type: String, default: null },
  },
  { _id: false },
);

const EditorLockSchema = new Schema(
  {
    lockedBy: { type: ObjectId, ref: "User", default: null },
    lockedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    // Fencing token: the deck save only matches while this is the saver's lock token.
    // Never exposed in any DTO.
    token: { type: String, default: null },
  },
  { _id: false },
);

const DeliverySchema = new Schema(
  {
    mode: { type: String, enum: PULSE_DELIVERY_MODES, default: "host-paced" },
    navigation: {
      type: String,
      enum: PULSE_NAVIGATION_MODES,
      default: "sequential",
    },
    displayMode: { type: String, enum: PULSE_DISPLAY_MODES, default: "full-prompt" },
  },
  { _id: false },
);

const RegistrationSchema = new Schema(
  {
    allowIITGAccounts: { type: Boolean, default: true },
    allowGuests: { type: Boolean, default: false },
    maxParticipants: {
      type: Number,
      min: 1,
      max: PULSE_DECK_LIMITS.maxParticipants,
      default: PULSE_DEFAULT_MAX_PARTICIPANTS,
    },
    allowLateJoin: { type: Boolean, default: PULSE_DEFAULT_ALLOW_LATE_JOIN },
  },
  { _id: false },
);

const SettingsSchema = new Schema(
  {
    timer: {
      overallEnabled: { type: Boolean, default: true },
      overallDurationSeconds: {
        type: Number,
        min: 1,
        default: 3600,
        validate: { validator: Number.isInteger, message: "Duration must be a whole number of seconds." },
      },
      perQuestionEnabled: { type: Boolean, default: true },
    },
    scoring: {
      mode: { type: String, enum: PULSE_SCORING_MODES, default: PULSE_DEFAULT_SCORING_MODE },
    },
    reveal: {
      showCorrectAnswer: { type: Boolean, default: false },
      showParticipantScore: { type: Boolean, default: false },
      showAnswerReview: { type: Boolean, default: false },
    },
    randomization: {
      enabled: { type: Boolean, default: false },
      randomizeQuestions: { type: Boolean, default: false },
      randomizeOptions: { type: Boolean, default: false },
    },
    leaderboard: {
      enabled: { type: Boolean, default: true },
      showAfterQuestions: { type: [String], default: [] },
      showManually: { type: Boolean, default: true },
      showAtEnd: { type: Boolean, default: true },
    },
  },
  { _id: false },
);

const CheckpointSchema = new Schema(
  {
    lastCompletedSlideIndex: { type: Number, min: -1, default: -1 },
    lastCheckpointAt: { type: Date, default: null },
  },
  { _id: false },
);

const LifecycleTimestampsSchema = new Schema(
  {
    lobbyOpenedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    timedOutAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { _id: false },
);

/* ---------- Slide validation ---------- */

// Phase 1 stored placeholder slides with an empty `content`; those stay valid here and
// the editor asks the host to fill them in. Any slide that has content must satisfy the
// shared Zod schema for its type.
function validateSlides(slides: unknown[]): boolean {
  const seen = new Set<string>();
  for (const slide of slides) {
    const plain = (slide as { toObject?: () => Record<string, unknown> }).toObject?.() ??
      (slide as Record<string, unknown>);
    const slideId = String(plain.slideId ?? "");
    if (seen.has(slideId)) return false;
    seen.add(slideId);
    const content = plain.content as Record<string, unknown> | undefined;
    if (!content || Object.keys(content).length === 0) continue;
    if (!pulseSlideSchema.safeParse(plain).success) return false;
  }
  return true;
}

/* ---------- PulseQuiz ---------- */

const PulseQuizSchema = new Schema(
  {
    title: { type: String, trim: true, maxlength: 200, default: "" },
    status: {
      type: String,
      enum: PULSE_QUIZ_STATUSES,
      required: true,
      default: PULSE_QUIZ_DEFAULT_STATUS,
    },
    roomCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: ROOM_CODE_PATTERN,
    },

    // Pending email owners have no user ID until their verified first sign-in.
    ownerId: { type: ObjectId, ref: "User", default: null },
    coHostIds: [{ type: ObjectId, ref: "User" }],
    hostAssignments: { type: [HostAssignmentSchema], default: [] },

    schedule: { type: ScheduleSchema, default: () => ({}) },
    delivery: { type: DeliverySchema, default: () => ({}) },
    registration: { type: RegistrationSchema, default: () => ({}) },
    settings: { type: SettingsSchema, default: () => ({}) },
    // Whole-deck rules (unique IDs, typed content) run on every Mongoose write; the API
    // route validates the same shapes first with the shared Zod schemas.
    slides: {
      type: [SlideSchema],
      default: [],
      validate: { validator: validateSlides, message: "The deck has invalid slides." },
    },
    // Incremented by every successful whole-deck save (optimistic concurrency).
    // Phase 1 documents lack it and are read as 0.
    deckVersion: { type: Number, min: 0, default: 0 },
    presenter: { type: PresenterSchema, default: () => ({}) },
    editorLock: { type: EditorLockSchema, default: () => ({}) },
    participantCount: { type: Number, min: 0, default: 0 },
    checkpoint: { type: CheckpointSchema, default: () => ({}) },
    timestamps: { type: LifecycleTimestampsSchema, default: () => ({}) },
  },
  { timestamps: true }, // createdAt / updatedAt
);

PulseQuizSchema.pre("validate", function () {
  const owners = this.hostAssignments.filter((host) => host.role === "owner");
  if (owners.length > 1 || (!this.ownerId && owners.length !== 1))
    this.invalidate("hostAssignments", "A quiz requires one owner.");
  const emails = this.hostAssignments.map((host) => host.email);
  if (new Set(emails).size !== emails.length)
    this.invalidate("hostAssignments", "Duplicate host emails are not allowed.");
  if (owners[0]?.userId && owners[0].userId.toString() !== this.ownerId?.toString())
    this.invalidate("ownerId", "Owner ID must match the owner assignment.");
  // Same compatibility rules as the deck editor (delivery, registration, timers,
  // scoring). Only re-checked when that configuration changes, so unrelated saves
  // (e.g. host linking) never fail on older documents.
  if (
    this.isNew ||
    this.isModified("delivery") ||
    this.isModified("registration") ||
    this.isModified("settings")
  ) {
    const plain = this.toObject();
    const result = pulseConfigSchema.safeParse({
      delivery: plain.delivery,
      registration: plain.registration,
      settings: plain.settings,
    });
    if (!result.success) {
      for (const issue of result.error.issues)
        this.invalidate(issue.path.join("."), issue.message);
    }
  }
});

// `roomCode` uniqueness lives here only (not also as `unique: true` on the
// path) to avoid a duplicate-index warning.
PulseQuizSchema.index({ roomCode: 1 }, { unique: true });
PulseQuizSchema.index({ status: 1 });
PulseQuizSchema.index({ "hostAssignments.email": 1 });
PulseQuizSchema.index({ ownerId: 1 });
PulseQuizSchema.index({ coHostIds: 1 });
PulseQuizSchema.index({ "schedule.scheduledAt": 1 });
PulseQuizSchema.index({ status: 1, "schedule.scheduledAt": 1 });

export type PulseQuizRecord = mongoose.InferSchemaType<typeof PulseQuizSchema> & {
  status: PulseQuizStatus;
  createdAt: Date;
  updatedAt: Date;
};

const PulseQuiz =
  (mongoose.models.PulseQuiz as mongoose.Model<PulseQuizRecord> | undefined) ||
  mongoose.model<PulseQuizRecord>(
    "PulseQuiz",
    PulseQuizSchema,
    "pulse_quizzes",
  );

export default PulseQuiz;
