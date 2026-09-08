import mongoose, { Schema, type Document } from "mongoose";
import {
  type IProblemSlot,
  type IRegistrationSettings,
  type IBracketSettings,
} from "./ContestMatch";

export interface IContestPreset extends Document {
  name: string;
  description?: string;

  // Ownership and Visibility
  creatorId: mongoose.Types.ObjectId;
  isGlobal: boolean;

  // Structural Settings
  format?: "1v1" | "solo-tournament" | "team-tournament" | "bracket";
  mode?: "blitz" | "arena";
  durationSeconds?: number;
  overallDurationMinutes?: number;
  perProblemDurationMinutes?: number;
  teamSize?: number;
  spectatorRestriction?: "none" | "all" | "admin_creator" | "club_members";

  // Complex configurations
  registrationSettings?: IRegistrationSettings;
  bracketSettings?: IBracketSettings;

  // Problem Selection
  problemSelectionMode?: "bulk" | "fine-tuned";
  // Mode A (Bulk)
  bulkPlatform?: string;
  bulkRatingMin?: number;
  bulkRatingMax?: number;
  bulkProblemCount?: number;
  bulkMinContestId?: number;
  // Mode B (Fine-tuned)
  problemSlots?: IProblemSlot[];

  archived?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProblemSlotSchema = new Schema<IProblemSlot>({
  platform: { type: String, required: true },
  rating: { type: Number },
  problemId: { type: String },
  roundNumber: { type: Number },
  points: { type: Number },
  timeLimitMinutes: { type: Number },
});

const RegistrationSettingsSchema = new Schema<IRegistrationSettings>({
  type: { type: String, enum: ["open", "closed"], required: true },
  maxParticipants: { type: Number, required: true, min: 2 },
  // Omit startTime and deadline as they are temporal and unique to matches
});

const BracketSettingsSchema = new Schema<IBracketSettings>({
  type: {
    type: String,
    enum: ["single_elimination", "double_elimination"],
    default: "single_elimination",
  },
  thirdPlacePlayoff: { type: Boolean, default: false },
  seedingMethod: {
    type: String,
    enum: ["cf_rating", "manual"],
    required: true,
  },
});

const ContestPresetSchema = new Schema<IContestPreset>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },

    creatorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    isGlobal: { type: Boolean, default: false, index: true },

    format: {
      type: String,
      enum: ["1v1", "solo-tournament", "team-tournament", "bracket"],
    },
    mode: {
      type: String,
      enum: ["blitz", "arena"],
    },
    durationSeconds: { type: Number },
    overallDurationMinutes: { type: Number },
    perProblemDurationMinutes: { type: Number },
    teamSize: { type: Number, enum: [1, 3] },
    spectatorRestriction: {
      type: String,
      enum: ["none", "all", "admin_creator", "club_members"],
    },

    registrationSettings: RegistrationSettingsSchema,
    bracketSettings: BracketSettingsSchema,

    problemSelectionMode: {
      type: String,
      enum: ["bulk", "fine-tuned"],
    },
    // Mode A
    bulkPlatform: { type: String },
    bulkRatingMin: { type: Number },
    bulkRatingMax: { type: Number },
    bulkProblemCount: { type: Number },
    bulkMinContestId: { type: Number },
    // Mode B
    problemSlots: [ProblemSlotSchema],

    archived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

const ContestPreset =
  (mongoose.models.ContestPreset as
    mongoose.Model<IContestPreset> | undefined) ||
  mongoose.model<IContestPreset>(
    "ContestPreset",
    ContestPresetSchema,
    "contest_presets",
  );

export default ContestPreset;
