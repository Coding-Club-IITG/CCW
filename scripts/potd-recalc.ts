/**
 * Full POTD recompute for all users
 *
 * Resets every user's stats and replays the entire finalized challenge history
 * chronologically. Use this when scoring/streak logic changed but the stored
 * solve data is already trustworthy.
 *
 *   pnpm tsx scripts/potd-recalc.ts            # dry run
 *   pnpm tsx scripts/potd-recalc.ts --execute  # apply
 */

import {
  connect,
  disconnect,
  backupPotd,
  verifyConsistency,
  CPUser,
} from "./_potd-shared";
import {
  getFinalizedChallenges,
  groupChallengesByDay,
  resetAllStats,
  resetSubmissionStatuses,
  replayUser,
} from "../src/lib/potd/recompute";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  console.log(
    `=== POTD recalc (all users) === mode=${EXECUTE ? "EXECUTE" : "DRY RUN"}`,
  );
  await connect();

  const challenges = await getFinalizedChallenges();
  const { daysMap, sortedDays } = groupChallengesByDay(challenges as any[]);
  const cpUsers = await CPUser.find();
  console.log(
    `Will recompute ${cpUsers.length} users across ${sortedDays.length} finalized days (${challenges.length} challenges).`,
  );

  if (!EXECUTE) {
    console.log(
      "Dry run - no changes written. Re-run with --execute to apply.",
    );
    await disconnect();
    return;
  }

  await backupPotd("recalc");

  console.log(
    "Resetting all stats + submission statuses (keeping solvedAt)...",
  );
  await resetAllStats();
  await resetSubmissionStatuses();

  for (let i = 0; i < cpUsers.length; i++) {
    const cp = cpUsers[i] as any;
    await replayUser(cp.userId, daysMap, sortedDays);
    if ((i + 1) % 10 === 0) console.log(`  ...${i + 1}/${cpUsers.length}`);
  }
  console.log("Replay complete.");

  console.log("Verifying...");
  await verifyConsistency();

  await disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Recalc failed:", err);
  process.exit(1);
});
