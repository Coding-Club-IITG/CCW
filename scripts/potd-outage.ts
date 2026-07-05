/**
 * POTD Outage Recovery script
 *
 * Given the day BEFORE the outage started (or the first affected day),
 * this re-fetches every verified user's real CF/AC submissions from that day to present,
 * records their solvedAt (ground truth), then recomputes everyone's scoring deterministically.
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
} from "./_potd-shared";
import { recoverOutage } from "../src/lib/potd/recompute";

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const EXECUTE = flags.execute === true;
  const from = typeof flags.from === "string" ? flags.from : "";

  if (!isValidDateStr(from)) {
    console.error(
      "Usage: pnpm tsx scripts/potd-outage.ts --from YYYY-MM-DD [--execute]"
    );
    process.exit(1);
  }

  console.log(
    `=== POTD outage recovery === from=${from} mode=${EXECUTE ? "EXECUTE" : "DRY RUN"}`,
  );
  await connect();

  if (EXECUTE) {
    await backupPotd("outage");
  }

  // Delegate core orchestration logic to src/lib/potd/recompute.ts
  await recoverOutage(from, EXECUTE);

  if (EXECUTE) {
    console.log("Verifying data consistency...");
    await verifyConsistency();
  }

  await disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Outage recovery script failed:", err);
  process.exit(1);
});
