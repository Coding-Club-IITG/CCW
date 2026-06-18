import mongoose, { Schema, type Document } from "mongoose";

export interface IFirstSolver {
  problemId: string;
  userId: mongoose.Types.ObjectId;
  solvedAt: Date;
}

export interface IContestRoom extends Document {
  contestId: mongoose.Types.ObjectId;
  name: string;
  status: "waiting" | "active" | "ended";
  participants: mongoose.Types.ObjectId[];
  teams: mongoose.Types.ObjectId[];
  currentRoundId?: mongoose.Types.ObjectId;
  currentProblemIndex: number;
  firstSolvers: IFirstSolver[];
  createdAt: Date;
  updatedAt: Date;
}

const FirstSolverSchema = new Schema<IFirstSolver>({
  problemId: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "CPUser", required: true },
  solvedAt: { type: Date, required: true },
});

const ContestRoomSchema = new Schema<IContestRoom>(
  {
    contestId: { type: Schema.Types.ObjectId, ref: "CustomContest", required: true, index: true },
    name: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["waiting", "active", "ended"],
      default: "waiting",
      index: true,
    },
    participants: [{ type: Schema.Types.ObjectId, ref: "CPUser", index: true }],
    teams: [{ type: Schema.Types.ObjectId, ref: "ContestTeam" }],
    currentRoundId: { type: Schema.Types.ObjectId, ref: "ContestRound" },
    currentProblemIndex: { type: Number, required: true, default: 0 },
    firstSolvers: { type: [FirstSolverSchema], default: [] },
  },
  { timestamps: true }
);

const ContestRoom =
  mongoose.models.ContestRoom ||
  mongoose.model<IContestRoom>("ContestRoom", ContestRoomSchema, "contest_rooms");

export default ContestRoom;
