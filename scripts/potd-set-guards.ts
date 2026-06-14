/**
 * Set POTD streak-reset guards in Redis for every finalized challenge day.
 *
 * Run this AFTER a manual recompute and BEFORE restarting the worker.
 *
 *   pnpm tsx scripts/potd-set-guards.ts                      # dry run (list days)
 *   pnpm tsx scripts/potd-set-guards.ts --execute            # set guards via Redis
 *   pnpm tsx scripts/potd-set-guards.ts --execute --ttl 60   # custom TTL (days)
 *   pnpm tsx scripts/potd-set-guards.ts --print              # emit redis-cli SET lines
 */

import { connect, disconnect, parseArgs } from "./_potd-shared";
import {
  getFinalizedChallenges,
  streakResetGuardKey,
} from "../src/lib/potd/recompute";
import { windowStartToISTDateStr } from "../src/lib/potd/utils";

const DEFAULT_TTL_DAYS = 30;

async function distinctFinalizedDays(): Promise<number[]> {
  const challenges = (await getFinalizedChallenges()) as any[];
  const days = new Set<number>();
  for (const c of challenges) days.add((c.windowStart as Date).getTime());
  return Array.from(days).sort((a, b) => a - b);
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const EXECUTE = flags.execute === true;
  const PRINT = flags.print === true;
  const ttlDays =
    typeof flags.ttl === "string" ? Number(flags.ttl) : DEFAULT_TTL_DAYS;
  if (!Number.isFinite(ttlDays) || ttlDays <= 0) {
    console.error("--ttl must be a positive number of days");
    process.exit(1);
  }
  const ttlSeconds = Math.round(ttlDays * 86_400);

  await connect();
  const days = await distinctFinalizedDays();

  if (PRINT) {
    console.error(
      `# ${days.length} finalized days, TTL ${ttlDays}d (${ttlSeconds}s)`,
    );
    for (const ms of days)
      console.error(`# ${windowStartToISTDateStr(new Date(ms))} -> ${ms}`);
    for (const ms of days) {
      console.log(`SET ${streakResetGuardKey(ms)} 1 EX ${ttlSeconds}`);
    }
    await disconnect();
    return;
  }

  console.log(
    `=== POTD set guards === mode=${EXECUTE ? "EXECUTE" : "DRY RUN"} days=${days.length} ttl=${ttlDays}d`,
  );

  if (!EXECUTE) {
    for (const ms of days) {
      console.log(
        `  would set ${streakResetGuardKey(ms)}  (${windowStartToISTDateStr(new Date(ms))})`,
      );
    }
    console.log(
      "Dry run - no Redis writes. Re-run with --execute (on the server) or use --print.",
    );
    await disconnect();
    return;
  }

  const { getRedis } = await import("../src/lib/redis");
  const redis = await getRedis();
  console.log("Redis PING:", await redis.ping());

  let set = 0;
  let already = 0;
  for (const ms of days) {
    const key = streakResetGuardKey(ms);
    if (await redis.get(key)) {
      already++;
      continue;
    }
    await redis.set(key, "1", { EX: ttlSeconds });
    set++;
  }
  console.log(`Done. Set ${set} new guards, ${already} already present.`);

  await redis.quit();
  await disconnect();
}

main().catch((err) => {
  console.error("Set guards failed:", err);
  process.exit(1);
});
