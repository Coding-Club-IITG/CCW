import mongoose from "mongoose";

const POTDSubmissionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    challengeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DailyChallenge",
      required: true,
    },
    // Lifecycle:
    //   Pending   -> not yet finalized (day still live, or awaiting sync)
    //   Accepted  -> solved within the main window: full points + streak increment
    //   Late      -> solved within the grace windowL 50% points, streak preserved (no increment)
    //   NotSolved -> finalized with no qualifying solve: 0 points, streak resets
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Late", "NotSolved"],
      default: "Pending",
    },
    solvedInGrace: { type: Boolean, default: false },
    pointsAwarded: { type: Number, default: 0 },
    solvedAt: { type: Date, default: null }, // CF submission timestamp (UTC)
    streakAtSolve: { type: Number, default: 0 }, // Streak the user was carrying on challenge day
    lastCheckedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Ensure one record per (user, challenge) pair
POTDSubmissionSchema.index({ userId: 1, challengeId: 1 }, { unique: true });

// Fetch Pending submissions for a challenge
POTDSubmissionSchema.index({ challengeId: 1, status: 1 });

// For leaderboard aggregation
POTDSubmissionSchema.index({ challengeId: 1, pointsAwarded: 1 });

// For user profile solve history
POTDSubmissionSchema.index({ userId: 1, solvedAt: 1 });

export type POTDSubmissionRecord = mongoose.InferSchemaType<
  typeof POTDSubmissionSchema
>;

const POTDSubmission =
  (mongoose.models.POTDSubmission as
    mongoose.Model<POTDSubmissionRecord> | undefined) ||
  mongoose.model<POTDSubmissionRecord>("POTDSubmission", POTDSubmissionSchema);

export default POTDSubmission;
