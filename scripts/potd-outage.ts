/**
 * POTD Outage Recovery script
 *
 * Given the day BEFORE the outage started (or the first affected day),
 * this re-fetches every verified user's real CF/AC submissions from that day
 * to present, then replays the full history so cumulative streaks are correct.
 *
 *   pnpm tsx scripts/potd-outage.ts --from 2026-06-10            # dry run
 *   pnpm tsx scripts/potd-outage.ts --from 2026-06-10 --execute  # apply
 *
 * Stop ccw-worker before running so the cron does not race this script.
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
} from "./_potd-shared";
import {
  fetchUserSubmissions,
  getFinalizedChallenges,
  groupChallengesByDay,
  backfillSolvedAt,
  resetAllStats,
  reconcileAllStats,
  resetSubmissionStatuses,
  replayUser,
  platformOf,
} from "../src/lib/potd/recompute";
import { computeWindowTimes } from "../src/lib/potd/utils";
import type { Platform } from "../src/lib/constants";

const CF_DELAY_MS = 2_100; // CF ~1 req/s
const AC_DELAY_MS = 1_100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const EXECUTE = flags.execute === true;
  const from = typeof flags.from === "string" ? flags.from : "";

  if (!isValidDateStr(from)) {
    console.error(
      "Usage: pnpm tsx scripts/potd-outage.ts --from YYYY-MM-DD [--execute]",
    );
    process.exit(1);
  }

  console.log(
    `=== POTD outage recovery === from=${from} mode=${EXECUTE ? "EXECUTE" : "DRY RUN"}`,
  );
  await connect();

  const fromWindowStart = computeWindowTimes(from).windowStart.getTime();

  const challenges = (await getFinalizedChallenges()) as any[];
  const toRefetch = challenges.filter(
    (c) => (c.windowStart as Date).getTime() >= fromWindowStart,
  );
  const { daysMap, sortedDays } = groupChallengesByDay(challenges);

  // Split the re-fetch set by platform
  const cfChallenges = toRefetch.filter((c) => platformOf(c) === "codeforces");
  const acChallenges = toRefetch.filter((c) => platformOf(c) === "atcoder");

  console.log(
    `Finalized challenges: ${challenges.length} total; ${toRefetch.length} to re-fetch from ${from} ` +
      `(CF=${cfChallenges.length}, AC=${acChallenges.length}) across ${sortedDays.length} replay days.`,
  );

  // Build verified-user -> handle maps
  const cpUsers = (await CPUser.find(
    {},
    "userId cfVerified acVerified",
  ).lean()) as any[];
  const userDocs = (await User.find(
    {},
    "_id codeforcesId atcoderId",
  ).lean()) as any[];
  const cfHandle = new Map<string, string>();
  const acHandle = new Map<string, string>();
  for (const u of userDocs) {
    if (u.codeforcesId) cfHandle.set(u._id.toString(), u.codeforcesId);
    if (u.atcoderId) acHandle.set(u._id.toString(), u.atcoderId);
  }
  const cfTargets = cpUsers.filter(
    (c) => c.cfVerified && cfHandle.has(c.userId.toString()),
  );
  const acTargets = cpUsers.filter(
    (c) => c.acVerified && acHandle.has(c.userId.toString()),
  );
  console.log(
    `CF-verified: ${cfTargets.length}, AC-verified: ${acTargets.length}`,
  );

  if (!EXECUTE) {
    console.log(
      "Dry run - no changes written. Re-run with --execute to apply.",
    );
    await disconnect();
    return;
  }

  await backupPotd("outage");

  // Backfill solvedAt from platform data
  const runPlatform = async (
    targets: any[],
    handleMap: Map<string, string>,
    chs: any[],
    platform: Platform,
    delayMs: number,
  ) => {
    if (chs.length === 0) return;
    console.log(`\nBackfilling ${platform} for ${targets.length} users...`);
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
            `  [${platform} ${i + 1}/${targets.length}] ${handle} attempt ${attempt} failed: ${e?.message}`,
          );
          if (attempt < 3) await sleep(3000);
        }
      }
      if (!ok) {
        console.log(
          `  [${platform} ${i + 1}/${targets.length}] ${handle} - skipped (records left intact)`,
        );
        await sleep(delayMs);
        continue;
      }
      const solved = await backfillSolvedAt(userId, chs, subs, platform);
      if (solved > 0 || (i + 1) % 10 === 0)
        console.log(
          `  [${platform} ${i + 1}/${targets.length}] ${handle}: ${solved} solves`,
        );
      await sleep(delayMs);
    }
  };

  await runPlatform(
    cfTargets,
    cfHandle,
    cfChallenges,
    "codeforces",
    CF_DELAY_MS,
  );
  await runPlatform(acTargets, acHandle, acChallenges, "atcoder", AC_DELAY_MS);

  // Chronological replay
  console.log("\nResetting all stats + submission statuses, then replaying...");
  await resetAllStats();
  await resetSubmissionStatuses();

  const allCp = await CPUser.find();
  for (let i = 0; i < allCp.length; i++) {
    await replayUser((allCp[i] as any).userId, daysMap, sortedDays);
    if ((i + 1) % 10 === 0) console.log(`  ...${i + 1}/${allCp.length}`);
  }
  console.log("Replay complete.");

  const reconciled = await reconcileAllStats();
  console.log(`Reconciled aggregate totals for ${reconciled} users.`);

  console.log("Verifying...");
  await verifyConsistency();

  await disconnect();
  console.log(
    "\nDone. Remember to set streak-reset guards and restart the worker (see scripts/potd-set-guards.ts).",
  );
}

main().catch((err) => {
  console.error("Outage recovery failed:", err);
  process.exit(1);
});
