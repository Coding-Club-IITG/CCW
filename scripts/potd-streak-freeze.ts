/**
 * POTD Streak Freeze & Invalidation Script
 *
 * Use Case:
 *   When the platform/database goes down and we could NOT share the daily challenge
 *   questions, meaning the majority of users had no way of knowing or solving the problem.
 *
 * Difference from potd-outage.ts:
 *   - potd-outage.ts: Used when the platform was down but we still managed to share the
 *     questions beforehand. It backfills solved times for those who solved the problem
 *     on CF/AC, but resets streaks to 0 for everyone who did not.
 *   - potd-streak-freeze.ts: Used when we could NOT share the questions. It registers
 *     the date in the POTDOutage collection. Users who solved the problem (e.g., by
 *     coincidence beforehand) still get points and streak increments, while everyone else's
 *     streaks are safely preserved/frozen at their previous value instead of reset to 0.
 *
 * Usage:
 *   pnpm tsx scripts/potd-streak-freeze.ts --date 2026-07-01            # dry run
 *   pnpm tsx scripts/potd-streak-freeze.ts --date 2026-07-01 --execute  # apply
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
} from "./_potd-shared";
import { registerStreakFreeze } from "../src/lib/potd/recompute";

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

  if (EXECUTE) {
    // Back up existing POTD state before writing changes
    await backupPotd(`streak-freeze-${dateStr}`);
  }

  // Delegate core orchestration logic to src/lib/potd/recompute.ts
  await registerStreakFreeze(dateStr, EXECUTE, `Outage on ${dateStr}`);

  if (EXECUTE) {
    console.log("Verifying data consistency...");
    await verifyConsistency();
  }

  await disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Streak freeze script failed:", err);
  process.exit(1);
});
