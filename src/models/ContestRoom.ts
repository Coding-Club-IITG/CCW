import mongoose, { Schema, type Document } from "mongoose";

export interface IFirstSolver {
  problemId: string;
  userId: mongoose.Types.ObjectId;
  solvedAt: Date;
}

export interface IBracketSlot {
  source: {
    kind: "seed" | "winner" | "loser";
    seed?: number;
    roomId?: mongoose.Types.ObjectId;
  };
  resolved: boolean;
  teamId?: mongoose.Types.ObjectId;
}
export interface IBracketDestination {
  roomId: mongoose.Types.ObjectId;
  slot: 0 | 1;
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
  bracketSlots?: IBracketSlot[];
  winnerDestination?: IBracketDestination;
  loserDestination?: IBracketDestination;
  bracketPlayable?: boolean;
  bracketConditional?: boolean;
  advancementCompletedAt?: Date;
  readyDeadline?: Date;
  terminationReason?: string;
  winnerTeamId?: mongoose.Types.ObjectId;
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
    bracketSlots: {
      type: [
        new Schema<IBracketSlot>(
          {
            source: {
              kind: {
                type: String,
                enum: ["seed", "winner", "loser"],
                required: true,
              },
              seed: Number,
              roomId: { type: Schema.Types.ObjectId, ref: "ContestRoom" },
            },
            resolved: { type: Boolean, required: true },
            teamId: { type: Schema.Types.ObjectId, ref: "ContestTeam" },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
    winnerDestination: {
      type: new Schema<IBracketDestination>(
        {
          roomId: {
            type: Schema.Types.ObjectId,
            ref: "ContestRoom",
            required: true,
          },
          slot: { type: Number, enum: [0, 1], required: true },
        },
        { _id: false },
      ),
    },
    loserDestination: {
      type: new Schema<IBracketDestination>(
        {
          roomId: {
            type: Schema.Types.ObjectId,
            ref: "ContestRoom",
            required: true,
          },
          slot: { type: Number, enum: [0, 1], required: true },
        },
        { _id: false },
      ),
    },
    bracketPlayable: Boolean,
    bracketConditional: Boolean,
    advancementCompletedAt: Date,
    readyDeadline: Date,
    terminationReason: { type: String },
    winnerTeamId: { type: Schema.Types.ObjectId, ref: "ContestTeam" },
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
