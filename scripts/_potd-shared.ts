/**
 * Shared bootstrap + helpers for POTD maintenance scripts
 */

import "../src/lib/env";

import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import User from "../src/models/User";
import CPUser from "../src/models/CPUser";
import Problem from "../src/models/POTDProblem";
import DailyChallenge from "../src/models/POTDDailyChallenge";
import POTDSubmission from "../src/models/POTDSubmission";
import POTDOutage from "../src/models/POTDOutage";

export {
  mongoose,
  User,
  CPUser,
  Problem,
  DailyChallenge,
  POTDSubmission,
  POTDOutage,
};

/** Connect to Mongo and register all POTD-related models */
export async function connect(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI not set in .env.local");
  await mongoose.connect(uri);
  [User, CPUser, Problem, DailyChallenge, POTDSubmission, POTDOutage].forEach(
    (m: any) => m && m.init && m.init(),
  );
  console.error("Connected to MongoDB.");
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * Snapshot CPUser POTD stats + POTDSubmissions to scripts/backup/
 * Pass userId to back up just that user.
 */
export async function backupPotd(label: string, userId?: any): Promise<string> {
  const userFilter = userId ? { userId } : {};
  const cpUsers = await CPUser.find(
    userFilter,
    "userId cfHandle acHandle potdTotalPoints potdTotalSolved potdCurrentStreak potdLongestStreak",
  ).lean();
  const submissions = await POTDSubmission.find(userFilter).lean();

  const dir = path.resolve(process.cwd(), "scripts/backup");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `potd-${label}-${Date.now()}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      { createdAt: new Date().toISOString(), label, cpUsers, submissions },
      null,
      2,
    ),
  );
  console.log(
    `Backup: ${file} (cpUsers=${cpUsers.length}, submissions=${submissions.length})`,
  );
  return file;
}

/**
 * Verify each user's stored aggregate stats equal the sum of their finalized
 * submissions, and longest >= current streak
 */
export async function verifyConsistency(userId?: any): Promise<boolean> {
  const filter = userId ? { userId } : {};
  const cpUsers = await CPUser.find(filter).lean();
  let problems = 0;
  for (const cp of cpUsers as any[]) {
    const agg = await POTDSubmission.aggregate([
      { $match: { userId: cp.userId } },
      {
        $group: {
          _id: null,
          pts: { $sum: "$pointsAwarded" },
          solved: {
            $sum: { $cond: [{ $in: ["$status", ["Accepted", "Late"]] }, 1, 0] },
          },
        },
      },
    ]);
    const pts = agg[0]?.pts ?? 0;
    const solved = agg[0]?.solved ?? 0;
    if (pts !== cp.potdTotalPoints || solved !== cp.potdTotalSolved) {
      problems++;
      console.log(
        `  ! INCONSISTENT ${cp.cfHandle || cp.userId}: stat pts=${cp.potdTotalPoints}/sum=${pts}  solved=${cp.potdTotalSolved}/count=${solved}`,
      );
    }
    if (cp.potdLongestStreak < cp.potdCurrentStreak) {
      problems++;
      console.log(
        `  ! STREAK ${cp.cfHandle || cp.userId}: longest ${cp.potdLongestStreak} < current ${cp.potdCurrentStreak}`,
      );
    }
  }
  console.log(
    problems === 0
      ? "  Consistency PASS."
      : `  ${problems} inconsistencies found.`,
  );
  return problems === 0;
}

/** Minimal '--flag' parser */
export function parseArgs(argv: string[]): {
  flags: Record<string, string | boolean>;
} {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { flags };
}

export const isValidDateStr = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
