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

async function run() {
  logger.info("[Worker] Starting standalone background worker...");

  // Ensure DB is connected
  await dbConnect();

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
    logger.info("[Worker] Stopping agenda...");
    await agenda.stop();
    process.exit(0);
  }

  process.on("SIGTERM", graceful);
  process.on("SIGINT", graceful);
}

run().catch((err) => {
  logger.error("[Worker] Fatal error during startup:", err);
  process.exit(1);
});
