import "./lib/env";
import agenda from "./lib/agenda";
import { syncCodeforcesRatings } from "./lib/jobs/cfSync";
import { syncAtCoderRatings } from "./lib/jobs/acSync";
import { syncPOTDSubmissions } from "./lib/jobs/potdSync";
import { syncContests } from "./lib/jobs/contestSync";
import { cleanupOrphanedBlogImages } from "./lib/jobs/blogImageCleanup";
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

  agenda.define("cleanup-blog-images", async () => {
    await cleanupOrphanedBlogImages();
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

  // Schedule blog image orphan cleanup weekly (every Sunday at 3:00 AM IST)
  await agenda.every("0 30 21 * * 0", "cleanup-blog-images");

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
