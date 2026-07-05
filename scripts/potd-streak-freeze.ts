/**
 * POTD Streak Freeze & Recovery Script
 *
 * Thin CLI client wrapper around registerStreakFreeze core logic.
 * Registers an outage date in the POTDOutage collection and triggers
 * user recomputations so that streaks are preserved on that day.
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
