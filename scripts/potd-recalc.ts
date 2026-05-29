import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";
import CPUser from "../src/models/CPUser";
import POTDSubmission from "../src/models/POTDSubmission";
import DailyChallenge from "../src/models/POTDDailyChallenge";
import Problem from "../src/models/POTDProblem";
import User from "../src/models/User";
import { processSubmission } from "../src/lib/potd/submit";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not found in .env.local");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  // Initialize models to ensure they are registered
  [User, CPUser, POTDSubmission, DailyChallenge, Problem].forEach(
    (m) => m && m.init && m.init(),
  );

  console.log("Fetching historical data...");
  const now = new Date();
  const challenges = await DailyChallenge.find({
    graceEnd: { $lte: now },
  })
    .sort({ windowStart: 1, difficulty: 1 })
    .populate("problem");

  // Group challenges by day (windowStart)
  const daysMap = new Map<string, any[]>();
  challenges.forEach((c: any) => {
    const day = c.windowStart.toISOString();
    if (!daysMap.has(day)) daysMap.set(day, []);
    daysMap.get(day)!.push(c);
  });

  const sortedDays = Array.from(daysMap.keys()).sort();
  const cpUsers = await CPUser.find();
  console.log(
    `Processing ${cpUsers.length} users across ${sortedDays.length} days of challenges...`,
  );

  console.log(
    "Resetting all user stats and submission statuses for clean recalculation...",
  );
  await CPUser.updateMany(
    {},
    {
      $set: {
        potdTotalPoints: 0,
        potdTotalSolved: 0,
        potdCurrentStreak: 0,
        potdLongestStreak: 0,
      },
    },
  );

  // Reset status and points but KEEP solvedAt as it's our source of truth
  await POTDSubmission.updateMany(
    {},
    {
      $set: { status: "Pending", pointsAwarded: 0, solvedInGrace: false },
    },
  );

  // Process users one by one to ensure streak logic is correctly applied sequentially
  for (let i = 0; i < cpUsers.length; i++) {
    const cpUser = cpUsers[i];
    const handle = cpUser.cfHandle || cpUser.acHandle || "unknown";
    console.log(`[${i + 1}/${cpUsers.length}] Recalculating for ${handle}...`);

    // Fetch all submissions for this user once to avoid repeated queries
    const userSubs = await POTDSubmission.find({ userId: cpUser.userId });

    for (const day of sortedDays) {
      const dayChallenges = daysMap.get(day)!;
      let solvedAnyToday = false;

      for (const challenge of dayChallenges) {
        // Find if we have a solve for this challenge
        const sub = userSubs.find(
          (s) => s.challengeId.toString() === challenge._id.toString(),
        );

        // Determine platform from challenge
        const platform = (challenge as any).platform || "codeforces";

        // Mock submissions format as expected by processSubmission
        const subs: any[] = [];
        if (sub && sub.solvedAt) {
          if (platform === "codeforces") {
            subs.push({
              verdict: "OK",
              problem: {
                contestId: (challenge.problem as any).contestId,
                index: (challenge.problem as any).problemIndex,
              },
              creationTimeSeconds: Math.floor(sub.solvedAt.getTime() / 1000),
            });
          } else {
            subs.push({
              result: "AC",
              problem_id: (challenge.problem as any).problemIndex,
              contest_id: (challenge.problem as any).contestId,
              epoch_second: Math.floor(sub.solvedAt.getTime() / 1000),
            });
          }
        }

        // Always fetch latest cpUser from DB to ensure processSubmission sees updated streak
        const latestCpUser = await CPUser.findOne({ userId: cpUser.userId });

        const result = await processSubmission(
          cpUser.userId.toString(),
          challenge,
          latestCpUser,
          subs,
          platform,
          new Date(),
        );

        if (result.status === "Accepted" || result.status === "Late") {
          solvedAnyToday = true;
        }
      }

      // If no solve at all today, reset streak
      if (!solvedAnyToday) {
        const latestCpUser = await CPUser.findOne({ userId: cpUser.userId });
        if (latestCpUser && latestCpUser.potdCurrentStreak > 0) {
          await CPUser.updateOne(
            { userId: cpUser.userId },
            { $set: { potdCurrentStreak: 0 } },
          );
        }
      }
    }
  }

  console.log("Recalculation complete!");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Recalculation failed:", err);
  process.exit(1);
});
