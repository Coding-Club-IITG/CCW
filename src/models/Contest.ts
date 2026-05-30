import mongoose, { Schema, type Document } from "mongoose";
import { CONTEST_PLATFORMS, type ContestPlatform } from "@/lib/constants";

export type { ContestPlatform };

export interface IContest extends Document {
  platform: ContestPlatform;
  platformContestId: string;
  name: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  url: string;
  lastSeenAt: Date;
}

const ContestSchema = new Schema<IContest>(
  {
    platform: {
      type: String,
      required: true,
      enum: CONTEST_PLATFORMS,
    },
    platformContestId: { type: String, required: true },
    name: { type: String, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    durationSeconds: { type: Number, required: true },
    url: { type: String, required: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ContestSchema.index({ platform: 1, platformContestId: 1 }, { unique: true });
ContestSchema.index({ startTime: 1 });

const Contest =
  mongoose.models.Contest || mongoose.model<IContest>("Contest", ContestSchema);

export default Contest;
