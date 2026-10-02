import { Queue } from "bullmq";

import { CONTEST_TIMING } from "@/lib/constants";

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
        delay: CONTEST_TIMING.cfRetryDelayMs,
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
      delay: CONTEST_TIMING.reconciliationRetryDelayMs,
    },
  },
});
