import "./lib/env";
import agenda from "./lib/agenda";
import { syncCodeforcesRatings } from "./lib/jobs/cfSync";
import { syncAtCoderRatings } from "./lib/jobs/acSync";
import { syncPOTDSubmissions } from "./lib/jobs/potdSync";
import { syncContests } from "./lib/jobs/contestSync";
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

  // Start agenda
  await agenda.start();

  // Schedule the CF ratings sync every 6 hours
  await agenda.every("6 hours", "sync-cf-ratings");

  // Schedule the AC ratings sync every 6 hours (offset by 3h from CF)
  await agenda.every("6 hours", "sync-ac-ratings");

  // Schedule POTD sync at 2:00 AM IST, after grace window close
  await agenda.every("0 30 20 * * *", "sync-potd-submissions");

  // Schedule contest sync every 3 hours
  await agenda.every("3 hours", "sync-contests");

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
