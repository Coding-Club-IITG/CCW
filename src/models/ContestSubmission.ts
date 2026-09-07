import mongoose, { Schema, type Document } from "mongoose";

export interface IContestSubmission extends Document {
  contestId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId; // For team contests
  problemId: string;
  platform: string;
  submissionId: string;
  verdict: string;
  points?: number; // Points awarded
  solveMs?: number; // Time to solve (in milliseconds)
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ContestSubmissionSchema = new Schema<IContestSubmission>(
  {
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "ContestMatch",
      required: true,
      index: true,
    },
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "ContestRoom",
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "CPUser", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "ContestTeam" },
    problemId: { type: String, required: true },
    platform: { type: String, required: true },
    submissionId: { type: String, required: true },
    verdict: { type: String, required: true },
    points: { type: Number },
    solveMs: { type: Number },
    submittedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

ContestSubmissionSchema.index({ roomId: 1, userId: 1 });
ContestSubmissionSchema.index({ contestId: 1, problemId: 1 });
// Reconciliation jobs can retry; the upstream Codeforces submission is the
// stable idempotency key for a room.
ContestSubmissionSchema.index({ roomId: 1, submissionId: 1 }, { unique: true });

const ContestSubmission =
  mongoose.models.ContestSubmission ||
  mongoose.model<IContestSubmission>(
    "ContestSubmission",
    ContestSubmissionSchema,
    "contest_submissions",
  );

export default ContestSubmission;
