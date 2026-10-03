import mongoose from "mongoose";

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
  type PulseQuizStatus,
} from "@/lib/pulse/constants";

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

// Minimal for now; Phase 2 (editor) fleshes out per-type content validation.
const SlideSchema = new Schema(
  {
    slideId: { type: String, required: true },
    order: { type: Number, required: true, min: 0 },
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
    displayMode: { type: String, default: "full-prompt" },
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
      overallDurationSeconds: { type: Number, min: 1, default: 3600 },
      perQuestionEnabled: { type: Boolean, default: true },
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
    slides: { type: [SlideSchema], default: [] },
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
  if (
    this.settings?.timer?.perQuestionEnabled &&
    this.delivery?.mode === "participant-paced"
  ) {
    this.invalidate(
      "settings.timer.perQuestionEnabled",
      "Per-question timers are only supported in host-paced mode.",
    );
  }
});

// `roomCode` uniqueness lives here only (not also as `unique: true` on the
// path) to avoid a duplicate-index warning.
PulseQuizSchema.index({ roomCode: 1 }, { unique: true });
PulseQuizSchema.index({ status: 1 });
PulseQuizSchema.index({ "hostAssignments.email": 1 });
PulseQuizSchema.index({ ownerId: 1 });
PulseQuizSchema.index({ coHostIds: 1 });

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
