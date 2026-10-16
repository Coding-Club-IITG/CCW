import { randomBytes } from "node:crypto";
import mongoose, { type Types } from "mongoose";

import { getRedis } from "@/lib/redis";
import {
  PULSE_EDITABLE_STATUSES,
  PULSE_EDITOR_LOCK_TTL_MS,
  pulseEditorLockKey,
} from "@/lib/pulse/constants";
import { errorToLogMetadata, getDisplayName, logger } from "@/lib/utils";
import PulseQuiz from "@/models/PulseQuiz";
import User from "@/models/User";

/**
 * Editor lock: the Redis key `pulse:{quizId}:editor-lock` is primary; the value is
 * `{userId}:{token}` (SET NX PX, TTL refreshed by heartbeat). `PulseQuiz.editorLock`
 * (lockedBy, lockedAt, expiresAt) mirrors it for durability and is the fallback when
 * Redis is unreachable, using atomic conditional updates. The token never leaves the
 * holder's own response. The mirror also stores it as a fencing token: the deck save
 * matches on it, so a holder who lost the lock after a successful check still fails.
 */

const REDIS_TIMEOUT_MS = 1_000;

// Compare-and-set scripts: only the exact current value may extend or delete the key.
const HEARTBEAT_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0`;
// 1 = deleted, 2 = already gone, 0 = held by a different value
const RELEASE_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then return 2 end
if current == ARGV[1] then return redis.call("DEL", KEYS[1]) end
return 0`;
// Same user re-acquiring replaces their own value (and token); nobody else's.
const REACQUIRE_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current or string.sub(current, 1, string.len(ARGV[2])) == ARGV[2] then
  redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[3])
  return ""
end
return current`;

export type EditorLockHolder = { name: string };
export type EditorLockAcquireResult =
  | { acquired: true; lockToken: string }
  | { acquired: false; holder: EditorLockHolder | null };

type Actor = { userId: string };
type RedisResult<T> = { available: true; value: T } | { available: false };

const objectId = (id: string) => new mongoose.Types.ObjectId(id);
const lockValue = (userId: string, token: string) => `${userId}:${token}`;

async function withRedis<T>(
  operation: string,
  quizId: string,
  run: (redis: Awaited<ReturnType<typeof getRedis>>) => Promise<T>,
): Promise<RedisResult<T>> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([
      getRedis().then(run),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Redis timed out")), REDIS_TIMEOUT_MS);
      }),
    ]);
    return { available: true, value };
  } catch (error) {
    logger.warn("Pulse editor lock: Redis unavailable, using MongoDB fallback", {
      operation, quizId, ...errorToLogMetadata(error),
    });
    return { available: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function describeLockHolder(userId: Types.ObjectId | string | null | undefined): Promise<EditorLockHolder | null> {
  if (!userId) return null;
  const user = await User.findById(userId).select("name email pizza_count").lean();
  return user ? { name: getDisplayName(user.name ?? user.email ?? "", user.pizza_count ?? 0) } : null;
}

/**
 * Atomically claims the durable mirror (free, expired, or already mine). Also blocks a
 * Redis acquire while the mirror shows another host's unexpired lock, e.g. after Redis
 * lost its keys.
 */
async function claimMirror(quizId: string, actor: Actor, token: string) {
  const now = new Date();
  const userId = objectId(actor.userId);
  const claimed = await PulseQuiz.findOneAndUpdate(
    {
      _id: quizId,
      status: { $in: PULSE_EDITABLE_STATUSES },
      $or: [
        { "editorLock.lockedBy": null },
        { "editorLock.expiresAt": null },
        { "editorLock.expiresAt": { $lte: now } },
        { "editorLock.lockedBy": userId },
      ],
    },
    { $set: { editorLock: { lockedBy: userId, lockedAt: now, expiresAt: new Date(now.getTime() + PULSE_EDITOR_LOCK_TTL_MS), token } } },
    { projection: { _id: 1 } },
  ).lean();
  return Boolean(claimed);
}

async function mirrorState(quizId: string) {
  const quiz = await PulseQuiz.findById(quizId).select("editorLock").lean();
  const lock = quiz?.editorLock;
  const live = lock?.lockedBy && lock.expiresAt && lock.expiresAt > new Date();
  return { lockedBy: live ? lock!.lockedBy! : null, token: live ? lock!.token ?? null : null };
}

export async function acquireEditorLock(quizId: string, actor: Actor): Promise<EditorLockAcquireResult> {
  const token = randomBytes(16).toString("hex");
  const value = lockValue(actor.userId, token);
  const key = pulseEditorLockKey(quizId);

  const redis = await withRedis("acquire", quizId, async (client) => {
    const created = await client.set(key, value, { NX: true, PX: PULSE_EDITOR_LOCK_TTL_MS });
    if (created) return { held: true as const };
    const current = String(await client.eval(REACQUIRE_SCRIPT, {
      keys: [key], arguments: [value, `${actor.userId}:`, String(PULSE_EDITOR_LOCK_TTL_MS)],
    }));
    return current === "" ? { held: true as const } : { held: false as const, currentHolder: current.split(":")[0] };
  });

  if (redis.available && !redis.value.held) {
    return { acquired: false, holder: await describeLockHolder(redis.value.currentHolder) };
  }

  let claimed: boolean;
  try {
    claimed = await claimMirror(quizId, actor, token);
  } catch (error) {
    if (redis.available) await releaseRedis(quizId, value);
    throw error;
  }
  if (!claimed) {
    if (redis.available) await releaseRedis(quizId, value);
    const mirror = await mirrorState(quizId);
    return { acquired: false, holder: await describeLockHolder(mirror.lockedBy) };
  }
  return { acquired: true, lockToken: token };
}

async function releaseRedis(quizId: string, value: string) {
  await withRedis("rollback", quizId, (client) =>
    client.eval(RELEASE_SCRIPT, { keys: [pulseEditorLockKey(quizId)], arguments: [value] }));
}

/** Extends the lock if `token` is still the holder's. Never touches anyone else's lock. */
export async function heartbeatEditorLock(quizId: string, userId: string, token: string): Promise<boolean> {
  const redis = await withRedis("heartbeat", quizId, async (client) =>
    Number(await client.eval(HEARTBEAT_SCRIPT, {
      keys: [pulseEditorLockKey(quizId)],
      arguments: [lockValue(userId, token), String(PULSE_EDITOR_LOCK_TTL_MS)],
    })));
  if (redis.available && redis.value !== 1) return false;

  const updated = await PulseQuiz.updateOne(
    {
      _id: quizId, status: { $in: PULSE_EDITABLE_STATUSES }, "editorLock.lockedBy": objectId(userId), "editorLock.token": token,
      // Redis is the authority when up; the mirror only has to be unexpired in fallback mode.
      ...(redis.available ? {} : { "editorLock.expiresAt": { $gt: new Date() } }),
    },
    { $set: { "editorLock.expiresAt": new Date(Date.now() + PULSE_EDITOR_LOCK_TTL_MS) } },
  );
  return redis.available || updated.matchedCount > 0;
}

/** Releases the lock if `token` is still the holder's; a stale token releases nothing. */
export async function releaseEditorLock(quizId: string, userId: string, token: string): Promise<{ released: boolean }> {
  const redis = await withRedis("release", quizId, async (client) =>
    Number(await client.eval(RELEASE_SCRIPT, {
      keys: [pulseEditorLockKey(quizId)], arguments: [lockValue(userId, token)],
    })));
  // Result 0 means someone else's value is in Redis: leave the mirror alone.
  if (redis.available && redis.value === 0) return { released: false };
  const cleared = await PulseQuiz.updateOne(
    { _id: quizId, "editorLock.lockedBy": objectId(userId), "editorLock.token": token },
    { $set: { editorLock: { lockedBy: null, lockedAt: null, expiresAt: null, token: null } } },
  );
  return { released: redis.available ? redis.value === 1 || cleared.modifiedCount > 0 : cleared.modifiedCount > 0 };
}

/** True when `token` currently holds the lock; used to authorize saves. */
export async function verifyEditorLock(quizId: string, userId: string, token: string): Promise<boolean> {
  const redis = await withRedis("verify", quizId, (client) => client.get(pulseEditorLockKey(quizId)));
  if (redis.available) return redis.value === lockValue(userId, token);
  const mirror = await mirrorState(quizId);
  return mirror.lockedBy?.toString() === userId && mirror.token === token;
}
