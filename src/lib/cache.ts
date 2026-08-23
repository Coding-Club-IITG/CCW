/**
 * Centralized Redis caching utility
 * Provides a cache-aside pattern with configurable TTLs and graceful fallback.
 */

import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/utils";

const CACHE_PREFIX = "ccw";
const REDIS_CONNECT_TIMEOUT_MS = 1000;

async function getRedisWithTimeout() {
  let timedOut = false;
  const redisPromise = getRedis().catch((err) => {
    logger.warn("[cache] Redis unavailable, falling through to fetch:", err);
    return null;
  });
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve(null);
    }, REDIS_CONNECT_TIMEOUT_MS);
  });
  const redis = await Promise.race([redisPromise, timeoutPromise]);
  if (timedOut) {
    logger.warn("[cache] Redis connection timed out, falling through to fetch");
  }
  return redis;
}

/**
 * Build a deterministic cache key from a prefix and parameters
 */
export function buildCacheKey(
  prefix: string,
  params?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!params || Object.keys(params).length === 0) {
    return `${CACHE_PREFIX}:${prefix}`;
  }
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${CACHE_PREFIX}:${prefix}:${sorted}`;
}

/**
 * Cache-aside fetch helper
 */
export async function cachedFetch<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  try {
    const redis = await getRedisWithTimeout();
    if (!redis) {
      return fetchFn();
    }

    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    const data = await fetchFn();
    // Store in background - don't block response on Redis write
    redis
      .set(key, JSON.stringify(data), { EX: ttlSeconds })
      .catch((err) => logger.warn("[cache] Redis SET failed:", err));
    return data;
  } catch (err) {
    logger.warn("[cache] Redis unavailable, falling through to fetch:", err);
    return fetchFn();
  }
}

/**
 * Invalidate all cache keys matching a prefix
 */
export async function invalidateCache(prefix: string): Promise<void> {
  try {
    const redis = await getRedisWithTimeout();
    if (!redis) return;

    const pattern = `${CACHE_PREFIX}:${prefix}:*`;

    for await (const keys of redis.scanIterator({
      MATCH: pattern,
      COUNT: 100,
    })) {
      if (Array.isArray(keys)) {
        if (keys.length > 0) await redis.unlink(keys);
      } else if (keys) {
        await redis.unlink(keys);
      }
    }

    // Also delete the exact prefix key (no params variant)
    await redis.unlink(`${CACHE_PREFIX}:${prefix}`);
  } catch (err) {
    logger.warn("[cache] invalidateCache failed:", err);
  }
}

/**
 * Invalidate specific cache keys
 */
export async function invalidateCacheKeys(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const redis = await getRedisWithTimeout();
    if (!redis) return;
    await redis.unlink(keys);
  } catch (err) {
    logger.warn("[cache] invalidateCacheKeys failed:", err);
  }
}

/** Default TTL values in seconds */
export const CACHE_TTLS = {
  TEAM: 21600, // 6h
  CONTESTS: 10800, // 3h
  CF_PROBLEMSET: 21600, // 6h
  CF_USER_INFO: 3600, // 1h
  EVENTS: 300, // 5min
  PROJECTS: 300, // 5min
  LEADERBOARDS: 300, // 5min
  BLOG: 120, // 2min
  FILES: 120, // 2min
  USERS: 120, // 2min
  POTD: 120, // 2min
  HACKATHONS: 300, // 5min
  HACKATHON_REQUESTS: 60, // 1min
  ATLAS: 120, // 2min
} as const;
