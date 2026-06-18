import { getRedis } from "@/lib/redis";

export async function publishRoom(roomId: string, event: any): Promise<number> {
  const redis = await getRedis();
  return redis.publish(`events:room:${roomId}`, JSON.stringify(event));
}

export async function publishContest(contestId: string, event: any): Promise<number> {
  const redis = await getRedis();
  return redis.publish(`events:contest:${contestId}`, JSON.stringify(event));
}

export async function publishUser(userId: string, event: any): Promise<number> {
  const redis = await getRedis();
  return redis.publish(`events:user:${userId}`, JSON.stringify(event));
}
