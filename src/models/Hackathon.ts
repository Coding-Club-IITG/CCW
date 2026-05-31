import mongoose from "mongoose";
import { HACKATHON_STATUSES } from "@/lib/constants";

const HackathonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    organization: { type: String, required: true, trim: true },
    minMembers: { type: Number, required: true, min: 1, default: 1 },
    maxMembers: { type: Number, required: true, min: 1 },
    skills: [{ type: String, trim: true }],
    websiteUrl: { type: String, required: true, trim: true },
    ogImage: { type: String, default: "" },
    deadline: { type: Date, required: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: HACKATHON_STATUSES,
      default: "active",
    },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

HackathonSchema.index({ status: 1, deadline: -1 });

export default mongoose.models.Hackathon ||
  mongoose.model("Hackathon", HackathonSchema);
