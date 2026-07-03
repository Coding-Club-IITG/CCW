import mongoose, { Schema, type Document } from "mongoose";

export interface IProblemSlot {
  platform: string;
  rating?: number;
  problemId?: string;
}

export interface IRegistration {
  userId: mongoose.Types.ObjectId;
  cfHandle: string;
  teamName?: string;
  registeredAt: Date;
}

export interface IRegistrationSettings {
  type: "open" | "closed";
  deadline: Date;
  maxParticipants: number;
}

export interface IBracketSettings {
  thirdPlacePlayoff: boolean;
  seedingMethod: "cf_rating" | "manual";
}

export interface ICustomContest extends Document {
  name: string;
  description?: string;
  creatorId: mongoose.Types.ObjectId;
  startTime?: Date;
  endTime?: Date;
  durationSeconds?: number;
  format: "1v1" | "solo-tournament" | "team-tournament" | "bracket";
  mode: "blitz" | "arena";
  status: "draft" | "registration" | "active" | "completed";
  teamSize?: number;
  presetId?: mongoose.Types.ObjectId;
  problemSelectionMode: "bulk" | "fine-tuned" | "test";
  // Mode A (Bulk)
  bulkPlatform?: string;
  bulkRatingMin?: number;
  bulkRatingMax?: number;
  bulkProblemCount?: number;
  // Mode B (Fine-tuned)
  problemSlots?: IProblemSlot[];
  // Registration and Bracket fields
  registrations?: IRegistration[];
  registrationSettings?: IRegistrationSettings;
  bracketSettings?: IBracketSettings;
  winner?: mongoose.Types.ObjectId;
  winnerName?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProblemSlotSchema = new Schema<IProblemSlot>({
  platform: { type: String, required: true },
  rating: { type: Number },
  problemId: { type: String },
});

const RegistrationSchema = new Schema<IRegistration>({
  userId: { type: Schema.Types.ObjectId, ref: "CPUser", required: true },
  cfHandle: { type: String, required: true },
  teamName: { type: String },
  registeredAt: { type: Date, default: Date.now },
});

const RegistrationSettingsSchema = new Schema<IRegistrationSettings>({
  type: { type: String, enum: ["open", "closed"], required: true },
  deadline: { type: Date, required: true },
  maxParticipants: { type: Number, required: true, min: 2 },
});

const BracketSettingsSchema = new Schema<IBracketSettings>({
  thirdPlacePlayoff: { type: Boolean, default: false },
  seedingMethod: { type: String, enum: ["cf_rating", "manual"], required: true },
});

const CustomContestSchema = new Schema<ICustomContest>(
  {
    name: { type: String, required: true },
    description: { type: String, maxlength: 500 },
    creatorId: { type: Schema.Types.ObjectId, ref: "CPUser", required: true, index: true },
    startTime: { type: Date },
    endTime: { type: Date },
    durationSeconds: { type: Number },
    format: {
      type: String,
      required: true,
      enum: ["1v1", "solo-tournament", "team-tournament", "bracket"],
    },
    mode: {
      type: String,
      required: true,
      enum: ["blitz", "arena"],
    },
    status: {
      type: String,
      required: true,
      enum: ["draft", "registration", "active", "completed"],
      default: "draft",
      index: true,
    },
    teamSize: {
      type: Number,
      enum: [1, 3],
    },
    presetId: { type: Schema.Types.ObjectId, ref: "ContestPreset" },
    problemSelectionMode: {
      type: String,
      required: true,
      enum: ["bulk", "fine-tuned", "test"],
    },
    // Mode A
    bulkPlatform: { type: String },
    bulkRatingMin: { type: Number },
    bulkRatingMax: { type: Number },
    bulkProblemCount: { type: Number },
    // Mode B
    problemSlots: [ProblemSlotSchema],
    // Registration and Bracket
    registrations: [RegistrationSchema],
    registrationSettings: RegistrationSettingsSchema,
    bracketSettings: BracketSettingsSchema,
    winner: { type: Schema.Types.ObjectId, ref: "ContestTeam" },
    winnerName: { type: String },
  },
  { timestamps: true }
);

CustomContestSchema.index({ status: 1, startTime: 1 });
CustomContestSchema.index({ format: 1, status: 1 });

const CustomContest =
  mongoose.models.CustomContest ||
  mongoose.model<ICustomContest>("CustomContest", CustomContestSchema, "custom_contests");

export default CustomContest;

