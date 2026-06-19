import { Worker, Job } from "bullmq";
import { connection } from "../bullmq";
import { logger } from "../utils";
import { syncCodeforcesProblems } from "../jobs/cfProblemSync";

export const cfSyncWorker = new Worker(
  "cf_sync_queue",
  async (job: Job) => {
    logger.info(`[cfSyncWorker] Processing job ${job.id} (name: ${job.name})`, job.data);
    
    if (job.name === "nightly-cf-problem-sync") {
      await syncCodeforcesProblems();
    }
  },
  {
    connection,
    limiter: {
      max: 2,
      duration: 1000,
    },
  }
);

cfSyncWorker.on("completed", (job) => {
  logger.info(`[cfSyncWorker] Job ${job.id} completed successfully`);
});

cfSyncWorker.on("failed", (job, err) => {
  logger.error(`[cfSyncWorker] Job ${job?.id} failed with error: ${err.message}`, err);
});
