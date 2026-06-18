import { createClient, type RedisClientType } from "redis";
import { logger } from "@/lib/utils";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => logger.error("Redis Client Error", err));

let connectPromise: Promise<RedisClientType> | null = null;

export async function getRedis(): Promise<RedisClientType> {
  if (redisClient.isReady) return redisClient as RedisClientType;
  if (!connectPromise) {
    connectPromise = redisClient
      .connect()
      .then(async () => {
        try {
          await redisClient.configSet("maxmemory-policy", "noeviction");
          await redisClient.configSet("notify-keyspace-events", "KEA");
        } catch (configErr) {
          logger.warn("Failed to set Redis configurations programmatically:", configErr);
        }
        return redisClient as RedisClientType;
      })
      .catch((err) => {
        connectPromise = null;
        throw err;
      });
  }
  return connectPromise;
}
