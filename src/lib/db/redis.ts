import { createClient } from "redis";

import { logger } from "@/lib/telemetry/logger";
import { sharedServerEnv } from "@/lib/env/shared";

const redisClient = createClient({
  url: sharedServerEnv.REDIS_URL,
});

redisClient.on("error", (err) => logger.error("Redis Client Error", err));

let connectPromise: Promise<typeof redisClient> | null = null;

export async function getRedis(): Promise<typeof redisClient> {
  if (redisClient.isReady) return redisClient;
  if (!connectPromise) {
    connectPromise = redisClient
      .connect()
      .then(async () => {
        try {
          await redisClient.configSet("maxmemory-policy", "noeviction");
          await redisClient.configSet("notify-keyspace-events", "KEA");
        } catch (configErr) {
          logger.warn(
            "Failed to set Redis configurations programmatically:",
            configErr,
          );
        }
        return redisClient;
      })
      .catch((err) => {
        connectPromise = null;
        throw err;
      });
  }
  return connectPromise;
}
