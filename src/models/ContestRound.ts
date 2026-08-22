import mongoose, { Schema, type Document } from "mongoose";

export interface IContestRound extends Document {
  contestId: mongoose.Types.ObjectId;
  roundNumber: number;
  name: string;
  status: "pending" | "active" | "completed";
  rooms: mongoose.Types.ObjectId[];
  bracketLevel?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContestRoundSchema = new Schema<IContestRound>(
  {
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "ContestMatch",
      required: true,
      index: true,
    },
    roundNumber: { type: Number, required: true },
    name: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "active", "completed"],
      default: "pending",
    },
    rooms: [{ type: Schema.Types.ObjectId, ref: "ContestRoom" }],
    bracketLevel: { type: String },
  },
  { timestamps: true },
);

ContestRoundSchema.index({ contestId: 1, roundNumber: 1 });

const ContestRound =
  (mongoose.models.ContestRound as mongoose.Model<IContestRound> | undefined) ||
  mongoose.model<IContestRound>(
    "ContestRound",
    ContestRoundSchema,
    "contest_rounds",
  );

export default ContestRound;
