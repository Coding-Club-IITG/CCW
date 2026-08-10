import mongoose from "mongoose";

const ProblemContentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    statementHtml: { type: String, required: true },
    inputSpecificationHtml: { type: String, default: "" },
    outputSpecificationHtml: { type: String, default: "" },
    constraintsHtml: { type: String, default: null },
    notesHtml: { type: String, default: null },
    samples: [
      {
        _id: false,
        input: { type: String, required: true },
        output: { type: String, required: true },
      },
    ],
    timeLimitMs: { type: Number, default: null },
    memoryLimitMb: { type: Number, default: null },
    sourceUrl: { type: String, required: true },
  },
  { _id: false },
);

const ProblemSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: ["codeforces", "atcoder"],
      required: true,
      default: "codeforces",
    },
    contestId: { type: String, required: true }, // CF: numeric string; AC: contest slug
    problemIndex: { type: String, required: true }, // CF: "A", "B1"; AC: task slug
    name: { type: String, required: true },
    rating: { type: Number, default: 0 },
    tags: [{ type: String }],
    content: { type: ProblemContentSchema, default: null },
    contentFetchedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Unique compound index - same problem can't be cached twice
ProblemSchema.index(
  { platform: 1, contestId: 1, problemIndex: 1 },
  { unique: true },
);

export default mongoose.models.Problem ||
  mongoose.model("Problem", ProblemSchema);
