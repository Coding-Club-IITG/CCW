import { createClient, type RedisClientType } from "redis";
import { logger } from "@/lib/utils";

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

export async function claimProblem(
  redis: any,
  locksKey: string,
  problemId: string,
  teamId: string,
  cfTimestamp: number,
): Promise<string> {
  const script = `
    local locksKey = KEYS[1]
    local problemId = ARGV[1]
    local teamId = ARGV[2]
    local cfTimestamp = tonumber(ARGV[3])
    
    local existing = redis.call("HGET", locksKey, problemId)
    if existing then
      local sepIndex = string.find(existing, "|")
      if sepIndex then
        local existingTeamId = string.sub(existing, 1, sepIndex - 1)
        local existingTimestamp = tonumber(string.sub(existing, sepIndex + 1))
        if cfTimestamp < existingTimestamp then
          redis.call("HSET", locksKey, problemId, teamId .. "|" .. cfTimestamp)
          return "reclaimed|" .. existingTeamId .. "|" .. existingTimestamp
        else
          return "lost"
        end
      end
    end
    
    redis.call("HSET", locksKey, problemId, teamId .. "|" .. cfTimestamp)
    return "claimed"
  `;

  return await redis.eval(script, {
    keys: [locksKey],
    arguments: [problemId, teamId, cfTimestamp.toString()],
  });
}

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
