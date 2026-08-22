import { getRedis } from "@/lib/redis";
import {
  contestEventSchema,
  roomEventSchema,
  userEventSchema,
  type ContestEvent,
  type RoomEvent,
  type UserEvent,
} from "@/lib/contests/runtime";

export async function publishRoom(
  roomId: string,
  event: RoomEvent,
): Promise<number> {
  const redis = await getRedis();
  return redis.publish(
    `events:room:${roomId}`,
    JSON.stringify(roomEventSchema.parse(event)),
  );
}

export async function publishContest(
  contestId: string,
  event: ContestEvent,
): Promise<number> {
  const redis = await getRedis();
  return redis.publish(
    `events:contest:${contestId}`,
    JSON.stringify(contestEventSchema.parse(event)),
  );
}

export async function publishUser(
  userId: string,
  event: UserEvent,
): Promise<number> {
  const redis = await getRedis();
  return redis.publish(
    `events:user:${userId}`,
    JSON.stringify(userEventSchema.parse(event)),
  );
}
