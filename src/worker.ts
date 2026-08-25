import "./lib/env";

import { cfSyncQueue } from "@/lib/contests/queues";
import { workerEnv } from "@/lib/env/worker";
import agenda from "@/lib/jobs/agenda";
import { syncAtCoderRatings } from "@/lib/jobs/acSync";
import { sendCalendarReminders } from "@/lib/jobs/calendarReminder";
import { syncCodeforcesRatings } from "@/lib/jobs/cfSync";
import { syncContests } from "@/lib/jobs/contestSync";
import { sendHackathonDeadlineReminders } from "@/lib/jobs/hackathonReminder";
import { cleanupOrphanedImages } from "@/lib/jobs/imageCleanup";
import { sendPOTDReminders } from "@/lib/jobs/potdReminder";
import { syncPOTDSubmissions } from "@/lib/jobs/potdSync";
import {
  AGENDA_JOB_SCHEDULES,
  AGENDA_SCHEDULE_OPTIONS,
  NIGHTLY_CF_PROBLEM_SCHEDULE,
} from "@/lib/jobs/schedules";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import { cfSyncWorker } from "@/lib/workers/cfSyncWorker";
import { reconciliationWorker } from "@/lib/workers/reconciliationWorker";
import { pushNotificationWorker } from "@/lib/workers/pushNotificationWorker";
import ContestQuestion from "@/models/ContestQuestion";

async function run() {
  void workerEnv;
  logger.info(
    "[Worker] Starting standalone background worker (Agenda + BullMQ)...",
  );

  // Ensure DB is connected
  await dbConnect();

  // BullMq sync runs at 2
  await cfSyncQueue.upsertJobScheduler(
    "nightly-cf-problem-sync",
    NIGHTLY_CF_PROBLEM_SCHEDULE,
    {
      name: "nightly-cf-problem-sync",
      data: {},
    },
  );
  logger.info(
    "[Worker] Scheduled nightly Codeforces problem sync repeatable job.",
  );

  const cfQuestionCount = await ContestQuestion.countDocuments();
  if (cfQuestionCount === 0) {
    logger.info(
      "[Worker] ContestQuestion database is empty. Triggering immediate full ingest...",
    );
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

  agenda.define("calendar-reminders", async () => {
    await sendCalendarReminders();
  });

  // Start agenda
  await agenda.start();

  for (const schedule of AGENDA_JOB_SCHEDULES) {
    await agenda.every(
      schedule.interval,
      schedule.name,
      undefined,
      AGENDA_SCHEDULE_OPTIONS,
    );
  }

  logger.info("[Worker] Agenda started and jobs scheduled.");

  // Graceful shutdown
  async function graceful() {
    logger.info("[Worker] Stopping agenda and BullMQ workers...");
    try {
      await Promise.all([
        agenda.stop(),
        cfSyncWorker.close(),
        reconciliationWorker.close(),
        pushNotificationWorker.close(),
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
