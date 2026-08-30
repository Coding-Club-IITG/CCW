import mongoose, { Schema, type Document } from "mongoose";

export interface IFirstSolver {
  problemId: string;
  userId: mongoose.Types.ObjectId;
  solvedAt: Date;
}

export interface IContestRoom extends Document {
  contestId: mongoose.Types.ObjectId;
  name: string;
  status: "waiting" | "active" | "ended" | "pending";
  participants: mongoose.Types.ObjectId[];
  teams: mongoose.Types.ObjectId[];
  currentRoundId?: mongoose.Types.ObjectId;
  currentProblemIndex: number;
  firstSolvers: IFirstSolver[];
  bracketPosition?: string | null;
  terminationReason?: string;
  actualStartTime?: Date;
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
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "ContestMatch",
      required: true,
    },
    name: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["waiting", "active", "ended", "pending"],
      default: "waiting",
    },
    participants: [{ type: Schema.Types.ObjectId, ref: "CPUser" }],
    teams: [{ type: Schema.Types.ObjectId, ref: "ContestTeam" }],
    currentRoundId: { type: Schema.Types.ObjectId, ref: "ContestRound" },
    currentProblemIndex: { type: Number, required: true, default: 0 },
    firstSolvers: { type: [FirstSolverSchema], default: [] },
    bracketPosition: { type: String, default: null },
    terminationReason: { type: String },
    actualStartTime: { type: Date },
  },
  { timestamps: true },
);

ContestRoomSchema.index({ contestId: 1, status: 1 });
ContestRoomSchema.index({ participants: 1, status: 1 });

const ContestRoom =
  (mongoose.models.ContestRoom as mongoose.Model<IContestRoom> | undefined) ||
  mongoose.model<IContestRoom>(
    "ContestRoom",
    ContestRoomSchema,
    "contest_rooms",
  );

export default ContestRoom;
