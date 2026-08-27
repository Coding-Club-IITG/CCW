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
import { workerOpsLogger } from "@/lib/telemetry/worker-logger";
import { logger } from "@/lib/utils";
import { cfSyncWorker } from "@/lib/workers/cfSyncWorker";
import { reconciliationWorker } from "@/lib/workers/reconciliationWorker";
import { pushNotificationWorker } from "@/lib/workers/pushNotificationWorker";
import ContestQuestion from "@/models/ContestQuestion";

function jobCorrelationId(job: {
  attrs: { data?: unknown };
}): string | undefined {
  const data = job.attrs.data;
  if (!data || typeof data !== "object") return undefined;
  const value = (data as Record<string, unknown>).correlationId;
  return typeof value === "string" ? value : undefined;
}

async function run() {
  void workerEnv;
  workerOpsLogger.info("Background worker starting", {
    attributes: {
      component: "worker",
      operation: "startup",
      outcome: "started",
    },
  });
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

  agenda.on("success", (job) => {
    workerOpsLogger.info("Background job completed", {
      correlationId: jobCorrelationId(job),
      attributes: {
        component: "agenda",
        jobName: job.attrs.name,
        operation: "execute",
        outcome: "success",
      },
    });
  });
  agenda.on("fail", (error, job) => {
    workerOpsLogger.error("Background job failed", {
      error,
      correlationId: jobCorrelationId(job),
      attributes: {
        component: "agenda",
        jobName: job.attrs.name,
        operation: "execute",
        outcome: "failure",
        retryable: true,
      },
    });
  });

  for (const schedule of AGENDA_JOB_SCHEDULES) {
    await agenda.every(
      schedule.interval,
      schedule.name,
      undefined,
      AGENDA_SCHEDULE_OPTIONS,
    );
  }

  logger.info("[Worker] Agenda started and jobs scheduled.");
  workerOpsLogger.info("Background worker ready", {
    attributes: {
      component: "worker",
      operation: "startup",
      outcome: "success",
    },
  });

  // Graceful shutdown
  let shutdownStarted = false;
  async function graceful(signal: NodeJS.Signals) {
    if (shutdownStarted) return;
    shutdownStarted = true;
    logger.info("[Worker] Stopping agenda and BullMQ workers...");
    workerOpsLogger.info("Background worker stopping", {
      attributes: {
        component: "worker",
        operation: "shutdown",
        outcome: "started",
        signal,
      },
    });
    let exitCode = 0;
    try {
      await Promise.all([
        agenda.stop(),
        cfSyncWorker.close(),
        reconciliationWorker.close(),
        pushNotificationWorker.close(),
      ]);
      logger.info("[Worker] All services stopped successfully.");
      workerOpsLogger.info("Background worker stopped", {
        attributes: {
          component: "worker",
          operation: "shutdown",
          outcome: "success",
          signal,
          exitCode,
        },
      });
    } catch (err) {
      exitCode = 1;
      workerOpsLogger.error("Background worker shutdown failed", {
        error: err,
        attributes: {
          component: "worker",
          operation: "shutdown",
          outcome: "failure",
          signal,
          exitCode,
        },
      });
    }
    await workerOpsLogger.flush();
    process.exit(exitCode);
  }

  process.on("SIGTERM", () => void graceful("SIGTERM"));
  process.on("SIGINT", () => void graceful("SIGINT"));
}

run().catch((err) => {
  workerOpsLogger.fatal("Background worker startup failed", {
    error: err,
    attributes: {
      component: "worker",
      operation: "startup",
      outcome: "failure",
      exitCode: 1,
    },
  });
  void workerOpsLogger.flush().finally(() => process.exit(1));
});
