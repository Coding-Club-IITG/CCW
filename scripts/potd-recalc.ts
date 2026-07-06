/**
 * Full POTD recompute for all users
 *
 * Rebuilds every user's stats and per-submission scoring from their stored solve facts.
 * Use this when scoring/streak logic changed but the stored solve data is trustworthy.
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
  buildTimeline,
  recomputeUsers,
  markPastDaysFinalized,
} from "../src/lib/potd/finalize";

const EXECUTE = process.argv.includes("--execute");

async function main() {
  console.log(
    `=== POTD recalc (all users) === mode=${EXECUTE ? "EXECUTE" : "DRY RUN"}`,
  );
  await connect();

  const now = new Date();
  const { days } = await buildTimeline(now);
  const cpUsers = await CPUser.find({}, "userId");
  console.log(
    `Will recompute ${cpUsers.length} users across ${days.length} days.`,
  );

  if (!EXECUTE) {
    console.log(
      "Dry run - no changes written. Re-run with --execute to apply.",
    );
    await disconnect();
    return;
  }

  await backupPotd("recalc");

  console.log("Recomputing all users from solve facts...");
  const userIds = (cpUsers as any[]).map((c) => c.userId);
  for (let i = 0; i < userIds.length; i++) {
    await recomputeUsers([userIds[i]], days, now);
    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${userIds.length}`);
  }

  const marked = await markPastDaysFinalized(now);
  console.log(
    `Recompute complete. Marked ${marked} past challenges finalized.`,
  );

  console.log("Verifying...");
  await verifyConsistency();

  await disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Recalc failed:", err);
  process.exit(1);
});
