import mongoose, { Schema, type Document } from "mongoose";
import { IProblemSlot } from "./CustomContest";

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
  // Mode B (Fine-tuned)
  problemSlots?: IProblemSlot[];
  createdAt: Date;
  updatedAt: Date;
}

const ProblemSlotSchema = new Schema<IProblemSlot>({
  platform: { type: String, required: true },
  rating: { type: Number, required: true },
});

const ContestPresetSchema = new Schema<IContestPreset>(
  {
    name: { type: String, required: true, unique: true, index: true },
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
    // Mode B
    problemSlots: [ProblemSlotSchema],
  },
  { timestamps: true }
);

const ContestPreset =
  mongoose.models.ContestPreset ||
  mongoose.model<IContestPreset>("ContestPreset", ContestPresetSchema, "contest_presets");

export default ContestPreset;
