import "./lib/env";
import agenda from "./lib/agenda";
import { syncCodeforcesRatings } from "./lib/jobs/cfSync";
import { syncAtCoderRatings } from "./lib/jobs/acSync";
import { syncPOTDSubmissions } from "./lib/jobs/potdSync";
import { syncContests } from "./lib/jobs/contestSync";
import { cleanupOrphanedImages } from "./lib/jobs/imageCleanup";
import { sendHackathonDeadlineReminders } from "./lib/jobs/hackathonReminder";
import { sendPOTDReminders } from "./lib/jobs/potdReminder";
import { logger } from "./lib/utils";
import dbConnect from "./lib/mongodb";
import { cfSyncWorker } from "./lib/workers/cfSyncWorker";
import { reconciliationWorker } from "./lib/workers/reconciliationWorker";
import { cfSyncQueue } from "./lib/bullmq";
import CFQuestion from "./models/CFQuestion";
import { startPresenceKeyspaceListener } from "./lib/presenceListener";

async function run() {
  logger.info("[Worker] Starting standalone background worker (Agenda + BullMQ)...");

  // Ensure DB is connected
  await dbConnect();

  // Start Redis keyspace notifications listener for presence tracking
  await startPresenceKeyspaceListener();

  // BullMq sync runs at 2
  await cfSyncQueue.add(
    "nightly-cf-problem-sync",
    {},
    {
      repeat: {
        pattern: "0 2 * * *",
      },
      jobId: "nightly-cf-problem-sync",
    }
  );
  logger.info("[Worker] Scheduled nightly Codeforces problem sync repeatable job.");


  const cfQuestionCount = await CFQuestion.countDocuments();
  if (cfQuestionCount === 0) {
    logger.info("[Worker] CFQuestion database is empty. Triggering immediate full ingest...");
    await cfSyncQueue.add("nightly-cf-problem-sync", { isFirstRun: true });
  }

  // Define jobs
  agenda.define("sync-cf-ratings", async () => {
    await syncCodeforcesRatings();
  });

  agenda.define("sync-ac-ratings", async () => {
    await syncAtCoderRatings();
  });

  agenda.define("sync-potd-submissions", async () => {
    await syncPOTDSubmissions();
  });

  agenda.define("sync-contests", async () => {
    await syncContests();
  });

  agenda.define("cleanup-images", async () => {
    await cleanupOrphanedImages();
  });

  agenda.define("hackathon-deadline-reminders", async () => {
    await sendHackathonDeadlineReminders();
  });

  agenda.define("potd-reminders", async () => {
    await sendPOTDReminders();
  });

  // Start agenda
  await agenda.start();

  // Schedule the CF ratings sync every 6 hours
  await agenda.every("6 hours", "sync-cf-ratings");

  // Schedule the AC ratings sync every 6 hours
  await agenda.every("6 hours", "sync-ac-ratings");

  // Schedule POTD sync daily at 2:05 AM IST, after grace window close
  await agenda.every("0 5 2 * * *", "sync-potd-submissions");

  // Schedule contest sync every 3 hours
  await agenda.every("3 hours", "sync-contests");

  // Schedule image orphan cleanup weekly, Sunday 3:00 AM IST
  await agenda.every("0 0 3 * * 0", "cleanup-images");

  // Schedule hackathon deadline reminders every hour
  await agenda.every("1 hour", "hackathon-deadline-reminders");

  // Schedule POTD reminders every hour
  await agenda.every("1 hour", "potd-reminders");

  logger.info("[Worker] Agenda started and jobs scheduled.");

  // Graceful shutdown
  async function graceful() {
    logger.info("[Worker] Stopping agenda and BullMQ workers...");
    try {
      await Promise.all([
        agenda.stop(),
        cfSyncWorker.close(),
        reconciliationWorker.close(),
      ]);
      logger.info("[Worker] All services stopped successfully.");
    } catch (err) {
      logger.error("[Worker] Error during graceful shutdown:", err);
    }
    process.exit(0);
  }

  process.on("SIGTERM", graceful);
  process.on("SIGINT", graceful);
}

run().catch((err) => {
  logger.error("[Worker] Fatal error during startup:", err);
  process.exit(1);
});
