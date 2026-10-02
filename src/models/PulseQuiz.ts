import mongoose from "mongoose";
const { Schema, model, Document } = mongoose;

// Enum for delivery modes
export type DeliveryMode = "host-paced" | "participant-paced";

// Enum for navigation modes
export type NavigationMode = "free" | "sequential";

// Enum for display modes
export type DisplayMode = "full-prompt" | "answer-controller";

// Enum for quiz status
export type QuizStatus =
  | "draft"
  | "scheduled"
  | "lobby_open"
  | "live"
  | "interaction_locked"
  | "completed"
  | "cancelled"
  | "archived";

// Interface for PulseQuiz document
export interface PulseQuiz extends Document {
  _id: string;
  title: string;
  schedule: {
    scheduledAt: Date;
    timezone: string;
  };
  status: QuizStatus;
  roomCode: string;
  ownerId: string; // Reference to User._id
  coHostIds: string[]; // References to User._id
  presenter: {
    activePresenterId: string | null; // Reference to User._id
    claimedAt: Date | null;
    viewMode: "selected_slide" | "overview";
    selectedSlideId: string | null;
  };
  editorLock: {
    lockedBy: string | null; // Reference to User._id
    lockedAt: Date | null;
    expiresAt: Date | null;
  };
  delivery: {
    mode: DeliveryMode;
    navigation: NavigationMode;
    displayMode: DisplayMode;
  };
  registration: {
    allowIITGAccounts: boolean;
    allowGuests: boolean;
    maxParticipants: number;
    allowLateJoin: boolean;
  };
  settings: {
    timer: {
      overallEnabled: boolean;
      overallDurationSeconds: number;
      perQuestionEnabled: boolean;
    };
    reveal: {
      showCorrectAnswer: boolean;
      showParticipantScore: boolean;
      showAnswerReview: boolean;
    };
    randomization: {
      enabled: boolean;
      randomizeQuestions: boolean;
      randomizeOptions: boolean;
    };
    leaderboard: {
      enabled: boolean;
      showAfterQuestions: number[]; // Slide indices
      showManually: boolean;
      showAtEnd: boolean;
    };
  };
  slides: Array<{
    slideId: string;
    order: number;
    type: "info" | "mcq" | "qa";
    content: {
      // Info slide
      markdown?: string;
      // MCQ slide
      text?: string;
      options?: string[];
      correctOptions?: number[]; // Indices of correct options
      multipleAnswers?: boolean;
      poll?: boolean;
      points?: number;
      // QA slide
      anonymous?: boolean;
      publicQuestions?: boolean;
      allowUpvotes?: boolean;
    };
  }>;
  participantCount: number;
  checkpoint: {
    lastCompletedSlideIndex: number; // -1 means none completed
    lastCheckpointAt: Date | null;
  };
  timestamps: {
    lobbyOpenedAt: Date | null;
    startedAt: Date | null;
    timedOutAt: Date | null;
    completedAt: Date | null;
    cancelledAt: Date | null;
    archivedAt: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Define the schema
const PulseQuizSchema = new Schema<PulseQuiz>(
  {
    title: { type: String, required: true },
    schedule: {
      scheduledAt: { type: Date, required: true },
      timezone: { type: String, required: true },
    },
    status: {
      type: String,
      enum: [
        "draft",
        "scheduled",
        "lobby_open",
        "live",
        "interaction_locked",
        "completed",
        "cancelled",
        "archived",
      ],
      default: "draft",
    },
    roomCode: { type: String, required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    coHostIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    presenter: {
      activePresenterId: { type: Schema.Types.ObjectId, ref: "User", default: null },
      claimedAt: { type: Date, default: null },
      viewMode: { type: String, enum: ["selected_slide", "overview"], default: "selected_slide" },
      selectedSlideId: { type: Schema.Types.ObjectId, ref: "PulseQuizSlide", default: null },
    },
    editorLock: {
      lockedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
      lockedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
    },
    delivery: {
      mode: { type: String, enum: ["host-paced", "participant-paced"], required: true },
      navigation: { type: String, enum: ["free", "sequential"], required: true },
      displayMode: { type: String, enum: ["full-prompt", "answer-controller"], required: true },
    },
    registration: {
      allowIITGAccounts: { type: Boolean, default: true },
      allowGuests: { type: Boolean, default: true },
      maxParticipants: { type: Number, default: 500 },
      allowLateJoin: { type: Boolean, default: false },
    },
    settings: {
      timer: {
        overallEnabled: { type: Boolean, default: true },
        overallDurationSeconds: { type: Number, default: 3600 },
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
        showAfterQuestions: [{ type: Number }],
        showManually: { type: Boolean, default: true },
        showAtEnd: { type: Boolean, default: true },
      },
    },
    slides: [
      {
        slideId: { type: String, required: true },
        order: { type: Number, required: true },
        type: { type: String, enum: ["info", "mcq", "qa"], required: true },
        content: {
          markdown: { type: String },
          text: { type: String },
          options: [{ type: String }],
          correctOptions: [{ type: Number }],
          multipleAnswers: { type: Boolean },
          poll: { type: Boolean },
          points: { type: Number },
          anonymous: { type: Boolean },
          publicQuestions: { type: Boolean },
          allowUpvotes: { type: Boolean },
        },
      },
    ],
    participantCount: { type: Number, default: 0 },
    checkpoint: {
      lastCompletedSlideIndex: { type: Number, default: -1 },
      lastCheckpointAt: { type: Date, default: null },
    },
    timestamps: {
      lobbyOpenedAt: { type: Date, default: null },
      startedAt: { type: Date, default: null },
      timedOutAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      cancelledAt: { type: Date, default: null },
      archivedAt: { type: Date, default: null },
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

// Indexes
PulseQuizSchema.index({ roomCode: 1 }, { unique: true });
PulseQuizSchema.index({ ownerId: 1, status: 1 });
PulseQuizSchema.index({ "coHostIds": 1 });
PulseQuizSchema.index({ status: 1, scheduledAt: 1 });

// Create and export the model - prevent overwriting in development
export default mongoose.models.PulseQuiz ||
  model<PulseQuiz>("PulseQuiz", PulseQuizSchema);