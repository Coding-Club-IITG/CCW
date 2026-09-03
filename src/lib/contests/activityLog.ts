import { getRedis } from "@/lib/redis";
import type { StoredActivityEntry } from "@/lib/contests/runtime";

const DEFAULT_MAX_ENTRIES = 50;

type Redis = Awaited<ReturnType<typeof getRedis>>;

/**
 * Appends an activity log entry to the **shared room-level** circular buffer.
 * Key: `room:{roomId}:activity_log`
 * Entries: presence events, solve/lock, user_ready, match start, team withdrawal.
 */
export async function appendRoomActivityLog(
  redis: Redis,
  roomId: string,
  entry: StoredActivityEntry,
  maxEntries = DEFAULT_MAX_ENTRIES,
): Promise<void> {
  const key = `room:${roomId}:activity_log`;
  await redis.lPush(key, JSON.stringify(entry));
  await redis.lTrim(key, 0, maxEntries - 1);
}

/**
 * Appends an activity log entry to the **per-user** circular buffer.
 * Key: `room:{roomId}:activity_log:{userId}`
 * Entries: sync.queued, sync.detected, sync.failed.
 */
export async function appendUserActivityLog(
  redis: Redis,
  roomId: string,
  userId: string,
  entry: StoredActivityEntry,
  maxEntries = DEFAULT_MAX_ENTRIES,
): Promise<void> {
  const key = `room:${roomId}:activity_log:${userId}`;
  await redis.lPush(key, JSON.stringify(entry));
  await redis.lTrim(key, 0, maxEntries - 1);
}
