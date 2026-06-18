import mongoose, { Schema, type Document } from "mongoose";

export interface IContestTeam extends Document {
  roomId: mongoose.Types.ObjectId;
  name: string;
  members: mongoose.Types.ObjectId[];
  score: number;
  createdAt: Date;
  updatedAt: Date;
}

const ContestTeamSchema = new Schema<IContestTeam>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: "ContestRoom", required: true, index: true },
    name: { type: String, required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "CPUser", required: true, index: true }],
    score: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

const ContestTeam =
  mongoose.models.ContestTeam ||
  mongoose.model<IContestTeam>("ContestTeam", ContestTeamSchema, "contest_teams");

export default ContestTeam;
