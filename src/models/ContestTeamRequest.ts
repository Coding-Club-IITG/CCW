import mongoose, { Schema, type Document } from "mongoose";

export interface IContestTeamRequest extends Document {
  contestId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  type: "join_request" | "invite";
  fromUserId: string;
  toUserId?: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: Date;
  updatedAt: Date;
}

const ContestTeamRequestSchema = new Schema<IContestTeamRequest>(
  {
    contestId: { type: Schema.Types.ObjectId, ref: "ContestMatch", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "ContestRegistrationTeam", required: true, index: true },
    type: { type: String, enum: ["join_request", "invite"], required: true },
    fromUserId: { type: String, required: true },
    toUserId: { type: String },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending", index: true },
  },
  { timestamps: true }
);

ContestTeamRequestSchema.index({ contestId: 1, teamId: 1, fromUserId: 1, type: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
ContestTeamRequestSchema.index({ contestId: 1, teamId: 1, toUserId: 1, type: 1 }, { unique: true, partialFilterExpression: { status: "pending", toUserId: { $ne: null } } });

export default mongoose.models.ContestTeamRequest || mongoose.model<IContestTeamRequest>("ContestTeamRequest", ContestTeamRequestSchema, "contest_team_requests");
