import { StoredActivityEntry } from "./runtime";

export async function appendActivityLog(
  redis: any,
  key: string,
  entry: Omit<StoredActivityEntry, "timestamp"> & { timestamp?: number },
  max: number = 50,
) {
  const finalEntry: StoredActivityEntry = {
    ...entry,
    timestamp: entry.timestamp ?? Date.now(),
  };
  const value = JSON.stringify(finalEntry);

  await redis.multi().lPush(key, value).lTrim(key, 0, max - 1).exec();
}
