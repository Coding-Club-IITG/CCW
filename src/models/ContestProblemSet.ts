import mongoose, { Schema, type Document } from "mongoose";

export interface ISelectedProblem {
  platform: string;
  problemId: string;
  name: string;
  rating?: number;
  url?: string;
  points: number;
  statementHtml?: string;
  inputSpecificationHtml?: string;
  outputSpecificationHtml?: string;
  constraintsHtml?: string;
  notesHtml?: string;
  samples?: Array<{ input: string; output: string }>;
  timeLimitMs?: number;
  memoryLimitMb?: number;
}

export interface IContestProblemSet extends Document {
  contestId: mongoose.Types.ObjectId;
  roomId?: mongoose.Types.ObjectId;
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
  statementHtml: { type: String },
  inputSpecificationHtml: { type: String },
  outputSpecificationHtml: { type: String },
  constraintsHtml: { type: String },
  notesHtml: { type: String },
  samples: [
    {
      input: { type: String, required: true },
      output: { type: String, required: true },
    },
  ],
  timeLimitMs: { type: Number },
  memoryLimitMb: { type: Number },
});

const ContestProblemSetSchema = new Schema<IContestProblemSet>(
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
      index: true,
      sparse: true,
    },
    problems: [SelectedProblemSchema],
  },
  { timestamps: true },
);

const ContestProblemSet =
  (mongoose.models.ContestProblemSet as
    mongoose.Model<IContestProblemSet> | undefined) ||
  mongoose.model<IContestProblemSet>(
    "ContestProblemSet",
    ContestProblemSetSchema,
    "contest_problem_sets",
  );

export default ContestProblemSet;
