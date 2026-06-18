import mongoose, { Schema, type Document } from "mongoose";

export interface IProblemSlot {
  platform: string;
  rating: number;
}

export interface ICustomContest extends Document {
  name: string;
  creatorId: mongoose.Types.ObjectId;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  format: "1v1" | "solo-tournament" | "team-tournament" | "bracket";
  mode: "blitz" | "arena";
  status: "draft" | "scheduled" | "active" | "ended";
  presetId?: mongoose.Types.ObjectId;
  problemSelectionMode: "bulk" | "fine-tuned";
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

const CustomContestSchema = new Schema<ICustomContest>(
  {
    name: { type: String, required: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "CPUser", required: true, index: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationSeconds: { type: Number, required: true },
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
      enum: ["draft", "scheduled", "active", "ended"],
      default: "draft",
      index: true,
    },
    presetId: { type: Schema.Types.ObjectId, ref: "ContestPreset" },
    problemSelectionMode: {
      type: String,
      required: true,
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

CustomContestSchema.index({ status: 1, startTime: 1 });

const CustomContest =
  mongoose.models.CustomContest ||
  mongoose.model<ICustomContest>("CustomContest", CustomContestSchema, "custom_contests");

export default CustomContest;
