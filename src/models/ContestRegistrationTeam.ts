import mongoose, { Schema, type Document } from "mongoose";

export interface IContestRegistrationTeam extends Document {
  contestId: mongoose.Types.ObjectId;
  name: string;
  leaderId: string;
  isPublic: boolean;
  joinCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContestRegistrationTeamSchema = new Schema<IContestRegistrationTeam>(
  {
    contestId: { type: Schema.Types.ObjectId, ref: "ContestMatch", required: true, index: true },
    name: { type: String, required: true },
    leaderId: { type: String, required: true },
    isPublic: { type: Boolean, default: true },
    joinCode: { type: String },
  },
  { timestamps: true }
);

ContestRegistrationTeamSchema.index({ contestId: 1, name: 1 }, { unique: true });

export default mongoose.models.ContestRegistrationTeam || mongoose.model<IContestRegistrationTeam>("ContestRegistrationTeam", ContestRegistrationTeamSchema, "contest_registration_teams");
