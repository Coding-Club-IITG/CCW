import mongoose, { Schema, type Document } from "mongoose";
import { IProblemSlot } from "./ContestMatch";

export interface IContestPreset extends Document {
  name: string;
  description?: string;
  format?: "1v1" | "solo-tournament" | "team-tournament" | "bracket";
  mode?: "blitz" | "arena";
  durationSeconds?: number;
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
  rating: { type: Number, required: true },
  problemId: { type: String },
  roundNumber: { type: Number },
  points: { type: Number, min: 0 },
  timeLimitSeconds: { type: Number, min: 1 },
});

const ContestPresetSchema = new Schema<IContestPreset>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String },
    format: {
      type: String,
      enum: ["1v1", "solo-tournament", "team-tournament", "bracket"],
    },
    mode: {
      type: String,
      enum: ["blitz", "arena"],
    },
    durationSeconds: { type: Number },
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
