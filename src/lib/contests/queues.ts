import { Queue, type ConnectionOptions } from "bullmq";

import type {
  CfSyncJobName,
  CfSyncQueueData,
  ReconciliationJobInput,
  ReconciliationJobName,
} from "@/lib/contests/runtime";
import { sharedServerEnv } from "@/lib/env/shared";

const redisUrl = new URL(sharedServerEnv.REDIS_URL);

export const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: redisUrl.port ? Number.parseInt(redisUrl.port, 10) : 6379,
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db:
    redisUrl.pathname && redisUrl.pathname.slice(1)
      ? Number.parseInt(redisUrl.pathname.slice(1), 10)
      : undefined,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
};

// Note: limiter is configured on the worker
export const cfSyncQueue = new Queue<CfSyncQueueData, void, CfSyncJobName>(
  "cf_sync_queue",
  {
    connection,
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
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});
