import { createClient } from "redis";

/** Test-only Redis helpers. Tests run against a non-zero logical DB and clean up what they create. */
export const TEST_REDIS_URL = "redis://127.0.0.1:6379/15";

function logicalDb(url: string): number {
  const path = new URL(url).pathname.slice(1);
  return path ? Number(path) : 0;
}

export function connectRedisClient() {
  return createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 1000, reconnectStrategy: false } });
}
export type TestRedis = ReturnType<typeof connectRedisClient>;

/** Returns null (and warns) when Redis is unreachable or would be the default DB 0. */
export async function connectTestRedis(): Promise<TestRedis | null> {
  const url = process.env.REDIS_URL ?? TEST_REDIS_URL;
  if (logicalDb(url) === 0) {
    console.warn("Refusing to use Redis DB 0 for tests; set REDIS_TEST_URL to a non-zero DB. Skipping Redis-backed tests.");
    return null;
  }
  const client = connectRedisClient();
  client.on("error", () => {});
  try {
    await client.connect();
    return client;
  } catch {
    console.warn(`Redis unavailable at ${url}: skipping Redis-backed tests.`);
    return null;
  }
}

/** Deletes the editor-lock keys of the given quizzes so tests never leave data behind. */
export async function deleteLockKeys(redis: TestRedis | null, quizIds: string[]) {
  if (redis && quizIds.length) await redis.del(quizIds.map((id) => `pulse:${id}:editor-lock`));
}
