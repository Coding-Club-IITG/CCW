import mongoose from "mongoose";

const DailyChallengeSchema = new mongoose.Schema(
  {
    // Window: 12:00 AM IST (18:30 UTC prev day) -> 11:59 PM IST (18:29 UTC)
    // Grace:  11:59 PM IST -> 2:00 AM IST next day (20:29:59 UTC, 2h grace)
    windowStart: { type: Date, required: true }, // 18:30 UTC on day-1
    windowEnd: { type: Date, required: true }, // 18:29:59 UTC on challenge date
    graceEnd: { type: Date, required: true }, // 20:29:59 UTC on challenge date
    problem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      required: true,
    },
    setBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Each difficulty level can appear at most once per day
DailyChallengeSchema.index({ windowStart: 1, difficulty: 1 }, { unique: true });

// Find unfinalized days past their grace window
DailyChallengeSchema.index({ graceEnd: 1, finalizedAt: 1 });

// Find challenges entering the reminder window.
DailyChallengeSchema.index({ windowEnd: 1 });

export type POTDDailyChallengeRecord = mongoose.InferSchemaType<
  typeof DailyChallengeSchema
>;

const DailyChallenge =
  (mongoose.models.DailyChallenge as
    | mongoose.Model<POTDDailyChallengeRecord>
    | undefined) ||
  mongoose.model<POTDDailyChallengeRecord>(
    "DailyChallenge",
    DailyChallengeSchema,
  );

export default DailyChallenge;
