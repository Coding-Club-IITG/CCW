/**
 * POTD Streak Freeze & Recovery Script
 *
 * Takes a date, marks the DailyChallenge(s) on that day as 'streakPreserved: true',
 * re-fetches submissions for that day to award points/streaks to those who solved it,
 * and recalculates streaks for everyone else without resetting them to 0.
 *
 *   pnpm tsx scripts/potd-streak-freeze.ts --date 2026-07-01            # dry run
 *   pnpm tsx scripts/potd-streak-freeze.ts --date 2026-07-01 --execute  # apply
 */

import {
  connect,
  disconnect,
  backupPotd,
  verifyConsistency,
  parseArgs,
  isValidDateStr,
  CPUser,
  User,
  DailyChallenge,
} from "./_potd-shared";
import {
  fetchUserSubmissions,
  backfillSolvedAt,
  platformOf,
} from "../src/lib/potd/recompute";
import {
  buildTimeline,
  recomputeUsers,
} from "../src/lib/potd/finalize";
import { computeWindowTimes } from "../src/lib/potd/utils";
import type { Platform } from "../src/lib/constants";

const CF_DELAY_MS = 2_100; // CF ~1 req/s
const AC_DELAY_MS = 1_100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const EXECUTE = flags.execute === true;
  const dateStr = typeof flags.date === "string" ? flags.date : "";

  if (!isValidDateStr(dateStr)) {
    console.error(
      "Usage: pnpm tsx scripts/potd-streak-freeze.ts --date YYYY-MM-DD [--execute]"
    );
    process.exit(1);
  }

  console.log(
    `=== POTD Streak Freeze === date=${dateStr} mode=${EXECUTE ? "EXECUTE" : "DRY RUN"}`
  );
  await connect();

  const now = new Date();
  const windowTimes = computeWindowTimes(dateStr);
  const fromWindowStart = windowTimes.windowStart.getTime();

  // Find daily challenges on that specific windowStart
  const challenges = (await DailyChallenge.find({
    windowStart: windowTimes.windowStart,
  }).populate("problem")) as any[];

  if (challenges.length === 0) {
    console.error(`No challenges found for date ${dateStr} (windowStart: ${windowTimes.windowStart.toISOString()}).`);
    await disconnect();
    process.exit(1);
  }

  console.log(`Found ${challenges.length} challenge(s) on ${dateStr}.`);
  for (const c of challenges) {
    console.log(`  - [${c.difficulty}] ID: ${c._id} (Problem: ${c.problem?.name || "unnamed"})`);
  }

  // Split challenges by platform
  const cfChallenges = challenges.filter((c) => platformOf(c) === "codeforces");
  const acChallenges = challenges.filter((c) => platformOf(c) === "atcoder");

  // Build verified-user -> handle maps
  const cpUsers = (await CPUser.find(
    {},
    "userId cfVerified acVerified"
  ).lean()) as any[];
  const userDocs = (await User.find(
    {},
    "_id codeforcesId atcoderId"
  ).lean()) as any[];

  const cfHandle = new Map<string, string>();
  const acHandle = new Map<string, string>();
  for (const u of userDocs) {
    if (u.codeforcesId) cfHandle.set(u._id.toString(), u.codeforcesId);
    if (u.atcoderId) acHandle.set(u._id.toString(), u.atcoderId);
  }

  const cfTargets = cpUsers.filter(
    (c) => c.cfVerified && cfHandle.has(c.userId.toString())
  );
  const acTargets = cpUsers.filter(
    (c) => c.acVerified && acHandle.has(c.userId.toString())
  );

  console.log(
    `Verified targets for polling -> CF: ${cfTargets.length}, AC: ${acTargets.length}`
  );

  if (!EXECUTE) {
    console.log(
      "\nDry run complete. No database changes were made. Re-run with --execute to apply."
    );
    await disconnect();
    return;
  }

  // Back up existing POTD state before writing changes
  await backupPotd(`streak-freeze-${dateStr}`);

  // Mark the challenges as streak-preserved
  console.log(`\nMarking challenges on ${dateStr} as streakPreserved: true...`);
  await DailyChallenge.updateMany(
    { windowStart: windowTimes.windowStart },
    { $set: { streakPreserved: true } }
  );

  // Backfill solvedAt from platform data for that day
  const runPlatform = async (
    targets: any[],
    handleMap: Map<string, string>,
    chs: any[],
    platform: Platform,
    delayMs: number
  ) => {
    if (chs.length === 0) return;
    console.log(`\nBackfilling ${platform} submissions...`);
    for (let i = 0; i < targets.length; i++) {
      const userId = targets[i].userId;
      const handle = handleMap.get(userId.toString())!;
      let subs: any[] = [];
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          subs = await fetchUserSubmissions(handle, platform, fromWindowStart);
          ok = true;
        } catch (e: any) {
          console.log(
            `  [${platform} ${i + 1}/${targets.length}] ${handle} attempt ${attempt} failed: ${e?.message}`
          );
          if (attempt < 3) await sleep(3000);
        }
      }
      if (!ok) {
        console.log(
          `  [${platform} ${i + 1}/${targets.length}] ${handle} - skipped`
        );
        await sleep(delayMs);
        continue;
      }
      const solved = await backfillSolvedAt(userId, chs, subs, platform);
      if (solved > 0 || (i + 1) % 10 === 0) {
        console.log(
          `  [${platform} ${i + 1}/${targets.length}] ${handle}: ${solved} solves`
        );
      }
      await sleep(delayMs);
    }
  };

  await runPlatform(
    cfTargets,
    cfHandle,
    cfChallenges,
    "codeforces",
    CF_DELAY_MS
  );
  await runPlatform(acTargets, acHandle, acChallenges, "atcoder", AC_DELAY_MS);

  console.log("\nRecomputing all users scoring timeline & streaks...");
  const { days } = await buildTimeline(now);
  const allCp = (await CPUser.find({}, "userId").lean()) as any[];
  for (let i = 0; i < allCp.length; i++) {
    await recomputeUsers([allCp[i].userId], days, now);
    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${allCp.length}`);
  }

  console.log("\nRecompute complete.");

  console.log("Verifying data consistency...");
  await verifyConsistency();

  await disconnect();
  console.log("\nDone. Streak freeze successfully applied!");
}

main().catch((err) => {
  console.error("Streak freeze script failed:", err);
  process.exit(1);
});
