import { Queue, ConnectionOptions } from "bullmq";
import { errorToLogMetadata, logger } from "./utils";

const redisUrlString = process.env.REDIS_URL || "redis://localhost:6379";
let redisUrl: URL;
try {
  redisUrl = new URL(redisUrlString);
} catch (err) {
  logger.error("Invalid BullMQ Redis URL; using localhost fallback", {
    operation: "parse_redis_url",
    ...errorToLogMetadata(err),
  });
  redisUrl = new URL("redis://localhost:6379");
}

export const connection: ConnectionOptions = {
  host: redisUrl.hostname || "127.0.0.1",
  port: redisUrl.port ? parseInt(redisUrl.port, 10) : 6379,
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db:
    redisUrl.pathname && redisUrl.pathname.slice(1)
      ? parseInt(redisUrl.pathname.slice(1), 10)
      : undefined,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
};

// Note: limiter is configured on the worker
export const cfSyncQueue = new Queue("cf_sync_queue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

export const reconciliationQueue = new Queue("reconciliation_queue", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000,
    },
  },
});
