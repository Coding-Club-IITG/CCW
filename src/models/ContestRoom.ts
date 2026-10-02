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

export interface IRoomAdmission {
  userId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  admittedAt: Date;
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
  readyOpensAt?: Date;
  readyDeadline?: Date;
  readyUserIds: mongoose.Types.ObjectId[];
  admissions: IRoomAdmission[];
  playingTeamIds: mongoose.Types.ObjectId[];
  participationRevision: number;
  runtimeSyncPending: boolean;
  durationSeconds?: number;
  judgingGraceSeconds?: number;
  problemDurationSeconds?: number;
  matchDeadline?: Date;
  terminationReason?: string;
  winnerTeamId?: mongoose.Types.ObjectId;
  actualStartTime?: Date;
  actualEndTime?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const FirstSolverSchema = new Schema<IFirstSolver>({
  problemId: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
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
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
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
    readyOpensAt: Date,
    readyDeadline: Date,
    readyUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    admissions: {
      type: [
        new Schema<IRoomAdmission>(
          {
            userId: {
              type: Schema.Types.ObjectId,
              ref: "User",
              required: true,
            },
            teamId: {
              type: Schema.Types.ObjectId,
              ref: "ContestTeam",
              required: true,
            },
            admittedAt: { type: Date, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    playingTeamIds: [{ type: Schema.Types.ObjectId, ref: "ContestTeam" }],
    participationRevision: { type: Number, default: 0 },
    runtimeSyncPending: { type: Boolean, default: true },
    durationSeconds: { type: Number, min: 1 },
    judgingGraceSeconds: { type: Number, min: 0 },
    problemDurationSeconds: { type: Number, min: 1 },
    matchDeadline: Date,
    terminationReason: { type: String },
    winnerTeamId: { type: Schema.Types.ObjectId, ref: "ContestTeam" },
    actualStartTime: { type: Date },
    actualEndTime: { type: Date },
  },
  { timestamps: true },
);

ContestRoomSchema.index({ contestId: 1, status: 1 });
ContestRoomSchema.index({ participants: 1, status: 1 });
ContestRoomSchema.index({ status: 1, runtimeSyncPending: 1, readyOpensAt: 1 });
ContestRoomSchema.index({ "admissions.userId": 1, actualEndTime: 1 });

const ContestRoom =
  (mongoose.models.ContestRoom as mongoose.Model<IContestRoom> | undefined) ||
  mongoose.model<IContestRoom>(
    "ContestRoom",
    ContestRoomSchema,
    "contest_rooms",
  );

export default ContestRoom;
