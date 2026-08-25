import { Queue } from "bullmq";

import type {
  CfSyncJobName,
  CfSyncQueueData,
  ReconciliationJobInput,
  ReconciliationJobName,
} from "@/lib/contests/runtime";
import { bullMqConnection } from "@/lib/bullmq";

// Note: limiter is configured on the worker
export const cfSyncQueue = new Queue<CfSyncQueueData, void, CfSyncJobName>(
  "cf_sync_queue",
  {
    connection: bullMqConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
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
      delay: 2000,
    },
  },
});
