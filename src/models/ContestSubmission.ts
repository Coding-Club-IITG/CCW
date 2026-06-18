import mongoose, { Schema, type Document } from "mongoose";

export interface IContestSubmission extends Document {
  contestId: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  problemId: string;
  platform: string;
  submissionId: string;
  verdict: string;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ContestSubmissionSchema = new Schema<IContestSubmission>(
  {
    contestId: { type: Schema.Types.ObjectId, ref: "CustomContest", required: true, index: true },
    roomId: { type: Schema.Types.ObjectId, ref: "ContestRoom", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "CPUser", required: true },
    problemId: { type: String, required: true },
    platform: { type: String, required: true },
    submissionId: { type: String, required: true },
    verdict: { type: String, required: true },
    submittedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

ContestSubmissionSchema.index({ roomId: 1, userId: 1 });
ContestSubmissionSchema.index({ contestId: 1, problemId: 1 });

const ContestSubmission =
  mongoose.models.ContestSubmission ||
  mongoose.model<IContestSubmission>("ContestSubmission", ContestSubmissionSchema, "contest_submissions");

export default ContestSubmission;
