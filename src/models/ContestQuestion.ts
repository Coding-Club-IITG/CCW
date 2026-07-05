import mongoose, { Schema, type Document } from "mongoose";

export interface IContestQuestion extends Document {
  problemId: string; // e.g. "1234A" (unique across all questions)
  contestId: number; // e.g. 1234
  index: string;     // e.g. "A"
  name: string;
  rating?: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ContestQuestionSchema = new Schema<IContestQuestion>(
  {
    problemId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    contestId: {
      type: Number,
      required: true,
      index: true,
    },
    index: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      index: true,
    },
    tags: [
      {
        type: String,
        index: true,
      },
    ],
  },
  { timestamps: true }
);

// Compound index to ensure uniqueness of contestId + index combination
ContestQuestionSchema.index({ contestId: 1, index: 1 }, { unique: true });

const ContestQuestion =
  mongoose.models.ContestQuestion ||
  mongoose.model<IContestQuestion>("ContestQuestion", ContestQuestionSchema, "cf_questions");

export default ContestQuestion;
