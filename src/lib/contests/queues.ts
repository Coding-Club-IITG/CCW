import { Queue } from "bullmq";

import { workerEnv } from "@/lib/env/worker";

import type {
  CfSyncJobName,
  CfSyncQueueData,
  ReconciliationJobInput,
  ReconciliationJobName,
} from "@/lib/contests/runtime";
import { bullMqConnection } from "@/lib/queues/bullMq";

// Note: limiter is configured on the worker
export const cfSyncQueue = new Queue<CfSyncQueueData, void, CfSyncJobName>(
  "cf_sync_queue",
  {
    connection: bullMqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: workerEnv.CONTEST_CF_RETRY_SECONDS * 1000,
      },
    },
  },
);

export const reconciliationQueue = new Queue<
  ReconciliationJobInput,
  void,
  ReconciliationJobName
>("reconciliation_queue", {
  connection: bullMqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: workerEnv.CONTEST_RECONCILIATION_RETRY_SECONDS * 1000,
    },
  },
});
