import mongoose, { Schema, type Document } from "mongoose";

export interface IContestTeam extends Document {
  roomId: mongoose.Types.ObjectId;
  name: string;
  members: mongoose.Types.ObjectId[];
  teamSize: number; // 1 or 3
  score: number;
  isNull?: boolean;
  entrantId?: mongoose.Types.ObjectId;
  seed?: number;
  frozenRating?: number;
  bracketLosses?: number;
  roundId?: mongoose.Types.ObjectId; // For tournament context
  contestId?: mongoose.Types.ObjectId; // For tournament context
  createdAt: Date;
  updatedAt: Date;
}

const ContestTeamSchema = new Schema<IContestTeam>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "ContestRoom",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "CPUser",
        required: true,
        index: true,
      },
    ],
    teamSize: { type: Number, required: true, enum: [1, 3] },
    score: { type: Number, required: true, default: 0 },
    isNull: { type: Boolean, default: false },
    entrantId: { type: Schema.Types.ObjectId },
    seed: Number,
    frozenRating: Number,
    bracketLosses: Number,
    roundId: { type: Schema.Types.ObjectId, ref: "ContestRound" },
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "ContestMatch",
      index: true,
    },
  },
  { timestamps: true },
);

const ContestTeam =
  (mongoose.models.ContestTeam as mongoose.Model<IContestTeam> | undefined) ||
  mongoose.model<IContestTeam>(
    "ContestTeam",
    ContestTeamSchema,
    "contest_teams",
  );

export default ContestTeam;
