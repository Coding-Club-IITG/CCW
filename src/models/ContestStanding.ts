import mongoose, { Schema, type Document } from "mongoose";

export interface IContestStanding extends Document {
  roomId: mongoose.Types.ObjectId;
  contestId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  score: number;
  rank?: number;
  problemsSolved: number;
  solvedTimes: Map<string, Date>;
  wins?: number;
  losses?: number;
  draws?: number;
  eliminated?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ContestStandingSchema = new Schema<IContestStanding>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "ContestRoom", required: true, index: true },
    contestId: { type: Schema.Types.ObjectId, ref: "CustomContest", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "ContestTeam" },
    userId: { type: Schema.Types.ObjectId, ref: "CPUser", required: true },
    score: { type: Number, required: true, default: 0 },
    rank: { type: Number },
    problemsSolved: { type: Number, required: true, default: 0 },
    solvedTimes: {
      type: Map,
      of: Date,
      default: new Map(),
    },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    eliminated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const ContestStanding =
  mongoose.models.ContestStanding ||
  mongoose.model<IContestStanding>("ContestStanding", ContestStandingSchema, "contest_standings");

export default ContestStanding;
