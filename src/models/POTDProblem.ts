import mongoose from "mongoose";

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
