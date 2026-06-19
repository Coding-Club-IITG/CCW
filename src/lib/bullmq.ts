import { Queue, ConnectionOptions } from "bullmq";
import { logger } from "./utils";

const redisUrlString = process.env.REDIS_URL || "redis://localhost:6379";
let redisUrl: URL;
try {
  redisUrl = new URL(redisUrlString);
} catch (err) {
  logger.error(`[BullMQ] Invalid REDIS_URL: ${redisUrlString}. Falling back to default localhost.`, err);
  redisUrl = new URL("redis://localhost:6379");
}

export const connection: ConnectionOptions = {
  host: redisUrl.hostname || "127.0.0.1",
  port: redisUrl.port ? parseInt(redisUrl.port, 10) : 6379,
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  db: (redisUrl.pathname && redisUrl.pathname.slice(1)) ? parseInt(redisUrl.pathname.slice(1), 10) : undefined,
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
};

// Create cf_sync_queue: limiter: { max: 2, duration: 1000 }, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
// Note: limiter is configured on the Worker 
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

// Create reconciliation_queue: defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
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

logger.info("[BullMQ] Queues initialized successfully.");
