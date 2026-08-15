/**
 * Fetch content for scheduled POTD problems whose content is missing
 *
 * Usage:
 *   pnpm tsx scripts/potd-problem-content.ts
 *   pnpm tsx scripts/potd-problem-content.ts --fetcher
 */

import "../src/lib/env";

import {
  fetchCodeforcesProblemHtml,
  fetchProblemContent,
} from "../src/lib/platforms/problemContent";
import { computeWindowTimes, getTodayISTDateStr } from "../src/lib/potd/utils";
import { connect, DailyChallenge, disconnect, Problem } from "./_potd-shared";

const args = process.argv.slice(2);
const unsupportedArgs = args.filter((argument) => argument !== "--fetcher");
if (unsupportedArgs.length > 0) {
  throw new Error(
    `Unknown option: ${unsupportedArgs.join(", ")}. Only --fetcher is supported.`,
  );
}
const useFetcher = args.includes("--fetcher");

async function main(): Promise<void> {
  await connect();

  const today = getTodayISTDateStr();
  const { windowStart } = computeWindowTimes(today);
  const futureLimit = new Date(
    windowStart.getTime() + 11 * 24 * 60 * 60 * 1000,
  );
  const problemIds = await DailyChallenge.distinct("problem", {
    windowStart: { $gte: windowStart, $lt: futureLimit },
  });
  const problems = await Problem.find({
    _id: { $in: problemIds },
    content: null,
  }).sort({ platform: 1, contestId: 1, problemIndex: 1 });

  console.log(
    `Found ${problems.length} scheduled POTD problem(s) with missing content.`,
  );

  let updated = 0;
  const failures: string[] = [];

  for (const problem of problems) {
    const key = `${problem.platform}:${problem.contestId}:${problem.problemIndex}`;
    try {
      const content = await fetchProblemContent(
        problem.platform,
        problem.contestId,
        problem.problemIndex,
        useFetcher && problem.platform === "codeforces"
          ? { fetcher: fetchCodeforcesProblemHtml }
          : undefined,
      );
      const normalizedContent = {
        title: content.title,
        statementHtml: content.statementHtml,
        inputSpecificationHtml: content.inputSpecificationHtml ?? "",
        outputSpecificationHtml: content.outputSpecificationHtml ?? "",
        constraintsHtml: content.constraintsHtml ?? null,
        notesHtml: content.notesHtml ?? null,
        samples: content.samples ?? [],
        timeLimitMs: content.timeLimitMs ?? null,
        memoryLimitMb: content.memoryLimitMb ?? null,
        sourceUrl: content.sourceUrl,
      };

      const result = await Problem.updateOne(
        { _id: problem._id, content: null },
        {
          $set: {
            content: normalizedContent,
            contentFetchedAt: new Date(),
          },
        },
        { runValidators: true },
      );
      if (result.modifiedCount === 0) {
        console.log(`SKIPPED ${key}: content was populated concurrently.`);
        continue;
      }

      updated += 1;
      console.log(
        `UPDATED ${key}: ${normalizedContent.samples.length} sample(s).`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${key}: ${message}`);
      console.error(`FAILED ${key}: ${message}`);
    }
  }

  console.log(
    `Finished: updated=${updated}, failed=${failures.length}, fetcher=${useFetcher ? "custom" : "direct"}.`,
  );
  if (failures.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(disconnect);
