/**
 * POTD Recalc for a single user on a particular day
 *
 * Use when a user solved a challenge but forgot to open/sync it.
 * Re-fetches that user's platform submissions from '--date' to the present,
 * records their solvedAt, then deterministically recomputes their points and streaks.
 *
 *   pnpm tsx scripts/potd-recalc-user.ts --user tourist --date 2026-06-12
 *   pnpm tsx scripts/potd-recalc-user.ts --user <cfHandle|acHandle|userId> --date 2026-06-12 --execute
 */

import {
  connect,
  disconnect,
  backupPotd,
  verifyConsistency,
  parseArgs,
  isValidDateStr,
  mongoose,
  User,
  CPUser,
  POTDSubmission,
} from "./_potd-shared";
import {
  fetchUserSubmissions,
  getFinalizedChallenges,
  backfillSolvedAt,
  platformOf,
} from "../src/lib/potd/recompute";
import { buildTimeline, recomputeUser } from "../src/lib/potd/finalize";
import {
  computeWindowTimes,
  windowStartToISTDateStr,
} from "../src/lib/potd/utils";
import type { Platform } from "../src/lib/constants";

async function resolveUser(userArg: string): Promise<any | null> {
  if (mongoose.isValidObjectId(userArg)) {
    const byId = await User.findById(userArg).lean();
    if (byId) return byId;
  }
  return User.findOne({
    $or: [{ codeforcesId: userArg }, { atcoderId: userArg }],
  }).lean();
}

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const EXECUTE = flags.execute === true;
  const userArg = typeof flags.user === "string" ? flags.user : "";
  const date = typeof flags.date === "string" ? flags.date : "";

  if (!userArg || !isValidDateStr(date)) {
    console.error(
      "Usage: pnpm tsx scripts/potd-recalc-user.ts --user <cfHandle|acHandle|userId> --date YYYY-MM-DD [--execute]",
    );
    process.exit(1);
  }

  console.log(
    `=== POTD recalc (user) === user=${userArg} date=${date} mode=${EXECUTE ? "EXECUTE" : "DRY RUN"}`,
  );
  await connect();

  const user = await resolveUser(userArg);
  if (!user) {
    console.error(`User not found for "${userArg}".`);
    await disconnect();
    process.exit(1);
  }
  const userId = user._id;
  const cpUser = (await CPUser.findOne({ userId }).lean()) as any;
  if (!cpUser) {
    console.error(`No CPUser profile for ${user.name || userId}.`);
    await disconnect();
    process.exit(1);
  }
  console.log(
    `Resolved: ${user.name || userId} (cf=${user.codeforcesId || "-"}${cpUser.cfVerified ? "✓" : ""}, ac=${user.atcoderId || "-"}${cpUser.acVerified ? "✓" : ""})`,
  );

  const now = new Date();
  const fromWindowStart = computeWindowTimes(date).windowStart.getTime();
  const challenges = (await getFinalizedChallenges(now)) as any[];

  const toRefetch = challenges.filter(
    (c) => (c.windowStart as Date).getTime() >= fromWindowStart,
  );
  console.log(
    `Finalized challenges: ${challenges.length}; re-fetching ${toRefetch.length} from ${date} onward.`,
  );

  if (!EXECUTE) {
    console.log(
      "Dry run - no changes written. Re-run with --execute to apply.",
    );
    await disconnect();
    return;
  }

  await backupPotd("recalc-user", userId);

  // Backfill the user's solvedAt for each platform they're verified on
  const doPlatform = async (
    platform: Platform,
    handle: string,
    verified: boolean,
  ) => {
    const chs = toRefetch.filter((c) => platformOf(c) === platform);
    if (!verified || !handle || chs.length === 0) return;
    let subs: any[] = [];
    try {
      subs = await fetchUserSubmissions(handle, platform, fromWindowStart);
    } catch (e: any) {
      console.log(
        `  ${platform} fetch failed for ${handle}: ${e?.message} - skipping`,
      );
      return;
    }
    const solved = await backfillSolvedAt(userId, chs, subs, platform);
    console.log(
      `  ${platform} (${handle}): ${solved} solves across ${chs.length} challenges`,
    );
  };

  await doPlatform("codeforces", user.codeforcesId, !!cpUser.cfVerified);
  await doPlatform("atcoder", user.atcoderId, !!cpUser.acVerified);

  console.log("Recomputing this user from solve facts...");
  const { days } = await buildTimeline(now);
  await recomputeUser(userId, days, now);

  const dayChallengeIds = challenges
    .filter((c) => (c.windowStart as Date).getTime() === fromWindowStart)
    .map((c) => c._id);
  if (dayChallengeIds.length > 0) {
    const daySubs = await POTDSubmission.find({
      userId,
      challengeId: { $in: dayChallengeIds },
    }).populate("challengeId");
    console.log(
      `\n${date} (${windowStartToISTDateStr(new Date(fromWindowStart))}) results:`,
    );
    for (const s of daySubs as any[]) {
      const c = s.challengeId as any;
      console.log(
        `  [${c?.difficulty}] status=${s.status} points=${s.pointsAwarded} solvedAt=${s.solvedAt ? new Date(s.solvedAt).toISOString() : "null"}`,
      );
    }
  }

  const after = (await CPUser.findOne({ userId }).lean()) as any;
  console.log(
    `\nNew totals: points=${after.potdTotalPoints} solved=${after.potdTotalSolved} currentStreak=${after.potdCurrentStreak} longestStreak=${after.potdLongestStreak}`,
  );

  console.log("Verifying...");
  await verifyConsistency(userId);

  await disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("User recalc failed:", err);
  process.exit(1);
});
