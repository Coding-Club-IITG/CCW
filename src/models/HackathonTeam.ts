import mongoose from "mongoose";
import { HACKATHON_TEAM_STATUSES } from "@/lib/constants";

const HackathonTeamSchema = new mongoose.Schema(
  {
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    owner: { type: String, required: true },
    members: [{ type: String }],
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: HACKATHON_TEAM_STATUSES,
      default: "open",
    },
  },
  { timestamps: true },
);

HackathonTeamSchema.index({ hackathonId: 1 });
HackathonTeamSchema.index({ hackathonId: 1, members: 1 });

export default mongoose.models.HackathonTeam ||
  mongoose.model("HackathonTeam", HackathonTeamSchema);
