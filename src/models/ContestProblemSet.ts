import mongoose, { Schema, type Document } from "mongoose";

export interface ISelectedProblem {
  platform: string;
  problemId: string;
  name: string;
  rating?: number;
  url?: string;
  points: number;
}

export interface IContestProblemSet extends Document {
  contestId: mongoose.Types.ObjectId;
  problems: ISelectedProblem[];
  createdAt: Date;
  updatedAt: Date;
}

const SelectedProblemSchema = new Schema<ISelectedProblem>({
  platform: { type: String, required: true },
  problemId: { type: String, required: true },
  name: { type: String, required: true },
  rating: { type: Number },
  url: { type: String },
  points: { type: Number, required: true, default: 100 },
});

const ContestProblemSetSchema = new Schema<IContestProblemSet>(
  {
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "CustomContest",
      required: true,
      unique: true,
      index: true,
    },
    problems: [SelectedProblemSchema],
  },
  { timestamps: true }
);

const ContestProblemSet =
  mongoose.models.ContestProblemSet ||
  mongoose.model<IContestProblemSet>("ContestProblemSet", ContestProblemSetSchema, "contest_problem_sets");

export default ContestProblemSet;
