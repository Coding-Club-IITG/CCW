import mongoose from "mongoose";

const SolvedProblemSchema = new mongoose.Schema(
  {
    problemId: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      default: 0,
    },
    solvedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const CPUserSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Codeforces profile
    cfHandle: {
      type: String,
      default: "",
    },
    cfRating: {
      type: Number,
      default: 0,
    },
    cfRank: {
      type: String,
      default: "Unrated",
    },
    cfMaxRating: {
      type: Number,
      default: 0,
    },
    cfMaxRank: {
      type: String,
      default: "Unrated",
    },
    cfAvatar: {
      type: String,
      default: "",
    },
    cfLastUpdated: {
      type: Date,
      default: null,
    },
    cfVerified: {
      type: Boolean,
      default: false,
    },
    cfVerificationToken: {
      type: String,
      default: "",
    },
    cfVerificationRequestedAt: {
      type: Date,
      default: null,
    },

    // AtCoder profile
    acHandle: {
      type: String,
      default: "",
    },
    acRating: {
      type: Number,
      default: 0,
    },
    acRank: {
      type: String,
      default: "Unrated",
    },
    acMaxRating: {
      type: Number,
      default: 0,
    },
    acMaxRank: {
      type: String,
      default: "Unrated",
    },
    acLastUpdated: {
      type: Date,
      default: null,
    },
    acVerified: {
      type: Boolean,
      default: false,
    },
    acVerificationToken: {
      type: String,
      default: "",
    },
    acVerificationRequestedAt: {
      type: Date,
      default: null,
    },

    // POTD stats
    potdTotalPoints: {
      type: Number,
      default: 0,
    },
    potdCurrentStreak: {
      type: Number,
      default: 0,
    },
    potdLongestStreak: {
      type: Number,
      default: 0,
    },
    potdTotalSolved: {
      type: Number,
      default: 0,
    },
    solvedProblems: {
      type: [SolvedProblemSchema],
      default: [],
    },
  },
  { timestamps: true },
);

CPUserSchema.index(
  { cfHandle: 1 },
  { unique: true, partialFilterExpression: { cfHandle: { $gt: "" } } },
);
CPUserSchema.index(
  { acHandle: 1 },
  { unique: true, partialFilterExpression: { acHandle: { $gt: "" } } },
);
CPUserSchema.index({ "solvedProblems.problemId": 1 });

export default mongoose.models.CPUser ||
  mongoose.model("CPUser", CPUserSchema, "cpusers");
