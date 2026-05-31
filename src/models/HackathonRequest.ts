import mongoose from "mongoose";
import {
  HACKATHON_REQUEST_TYPES,
  HACKATHON_REQUEST_STATUSES,
} from "@/lib/constants";

const HackathonRequestSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HackathonTeam",
      required: true,
    },
    hackathonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hackathon",
      required: true,
    },
    fromUserId: { type: String, required: true },
    toUserId: { type: String, default: null },
    type: {
      type: String,
      enum: HACKATHON_REQUEST_TYPES,
      required: true,
    },
    status: {
      type: String,
      enum: HACKATHON_REQUEST_STATUSES,
      default: "pending",
    },
  },
  { timestamps: true },
);

// Prevent duplicate pending requests
HackathonRequestSchema.index(
  { teamId: 1, fromUserId: 1, type: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);
HackathonRequestSchema.index(
  { teamId: 1, toUserId: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending", toUserId: { $ne: null } },
  },
);
HackathonRequestSchema.index({ toUserId: 1, status: 1 });
HackathonRequestSchema.index({ teamId: 1, status: 1 });

export default mongoose.models.HackathonRequest ||
  mongoose.model("HackathonRequest", HackathonRequestSchema);
