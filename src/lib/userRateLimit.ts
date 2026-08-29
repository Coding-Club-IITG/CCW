import { sharedServerEnv } from "@/lib/env/shared";
import { getRedis } from "@/lib/redis";

export interface UserRateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

function key(name: string, userId: string) {
  return `user-rate-limit:${name}:${userId}`;
}

/** Atomically consume a named user-facing cooldown */
export async function consumeUserRateLimit(
  name: string,
  userId: string,
  durationSeconds: number,
): Promise<UserRateLimitResult> {
  if (sharedServerEnv.DEV_DISABLE_USER_RATE_LIMITS) {
    return { allowed: true, retryAfter: 0 };
  }
  const redis = await getRedis();
  const redisKey = key(name, userId);
  const acquired = await redis.set(redisKey, "1", {
    NX: true,
    EX: durationSeconds,
  });
  if (acquired) return { allowed: true, retryAfter: 0 };
  return { allowed: false, retryAfter: Math.max(0, await redis.ttl(redisKey)) };
}

/** Release a consumed cooldown when its protected workflow did not start */
export async function releaseUserRateLimit(name: string, userId: string) {
  if (sharedServerEnv.DEV_DISABLE_USER_RATE_LIMITS) return;
  const redis = await getRedis();
  await redis.del(key(name, userId));
}

export const userRateLimitsEnabled =
  !sharedServerEnv.DEV_DISABLE_USER_RATE_LIMITS;
