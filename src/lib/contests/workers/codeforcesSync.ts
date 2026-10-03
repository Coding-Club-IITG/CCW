import { type Job, Worker } from "bullmq";

import { CONTEST_TIMING } from "@/lib/constants";

import { publishUser } from "@/lib/contests/events";
import { reconcileMatch } from "@/lib/contests/gameplay";
import { submissionWindow } from "@/lib/contests/matchScoring";
import {
  cfSyncJobDataSchema,
  nightlyProblemSyncJobDataSchema,
  type CfSyncJobName,
  type CfSyncQueueData,
} from "@/lib/contests/runtime";
import { connectMongoDB } from "@/lib/db/mongodb";
import { syncCodeforcesProblems } from "@/lib/jobs/codeforcesProblems";
import { fetchCodeforcesUserStatus } from "@/lib/platforms/codeforces";
import { bullMqConnection } from "@/lib/queues/bullMq";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import ContestRoom from "@/models/ContestRoom";

export const codeforcesSyncWorker = new Worker<
  CfSyncQueueData,
  void,
  CfSyncJobName
>(
  "cf_sync_queue",
  async (job: Job<CfSyncQueueData, void, CfSyncJobName>) => {
    if (job.name === "nightly-cf-problem-sync") {
      nightlyProblemSyncJobDataSchema.parse(job.data);
      await syncCodeforcesProblems();
      return;
    }

    const data = cfSyncJobDataSchema.parse(job.data);
    const { roomId, userId, teamId, cfHandle, problemId } = data;

    await connectMongoDB();

    const room = await ContestRoom.findById(roomId).lean();
    const admission = room?.admissions.find(
      (entry) =>
        String(entry.userId) === userId && String(entry.teamId) === teamId,
    );
    const problem = room?.problemStates.find(
      (entry) => entry.problemId === problemId,
    );

    if (
      !room ||
      room.status !== "active" ||
      !admission ||
      !problem ||
      problem.revealedAt === undefined
    ) {
      await publishUser(userId, roomId, {
        type: "sync.failed",
        reason: "not_admitted_or_inactive",
        problemId,
      });
      return;
    }

    const window = submissionWindow(
      room,
      problem,
      admission.admittedAt.getTime(),
    );

    if (Date.now() > window.judgingDeadline) {
      await publishUser(userId, roomId, {
        type: "sync.failed",
        reason: "judging_closed",
        problemId,
      });
      return;
    }

    const submissions = (
      await fetchCodeforcesUserStatus(cfHandle, 20, 1, problemId)
    )
      .filter(
        (submission) =>
          `${submission.problem.contestId ?? ""}${submission.problem.index}`.toUpperCase() ===
            problemId.toUpperCase() &&
          submission.author?.members.some(
            (member) => member.handle.toLowerCase() === cfHandle.toLowerCase(),
          ),
      )
      .map((submission) => ({
        submissionId: String(submission.id),
        submittedAt: submission.creationTimeSeconds * 1000,
        verdict: submission.verdict ?? "TESTING",
      }));
    const result = await reconcileMatch(roomId, {
      userId,
      teamId,
      problemId,
      submissions,
    });

    await publishUser(userId, roomId, {
      type: result.accepted ? "sync.detected" : "sync.failed",
      verdict: result.verdict,
      problemId,
    });
  },
  {
    connection: bullMqConnection,
    concurrency: 1,
    lockDuration: CONTEST_TIMING.workerLockMs,
    limiter: {
      max: 2,
      duration: CONTEST_TIMING.cfRateWindowMs,
    },
  },
);

codeforcesSyncWorker.on("failed", async (job, error) => {
  logger.error("Contest Codeforces sync failed", {
    worker: "codeforcesSyncWorker",
    jobId: job?.id,
    ...errorToLogMetadata(error),
  });

  if (job?.name === "cf_sync" && job.attemptsMade >= (job.opts.attempts || 3)) {
    const { userId, roomId, problemId } = cfSyncJobDataSchema.parse(job.data);

    await publishUser(userId, roomId, {
      type: "sync.failed",
      reason: "cf_unavailable",
      problemId,
    });
  }
});
