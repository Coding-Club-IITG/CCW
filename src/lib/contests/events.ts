import { getRedis } from "@/lib/redis";
import {
  contestEventSchema,
  roomEventSchema,
  userEventSchema,
  type ContestEvent,
  type RoomEvent,
  type UserEvent,
} from "@/lib/contests/runtime";
import type { RoomActivityDto } from "@/lib/contests/dtos";

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

/**
 * Records a shared room activity to the capped Redis list and broadcasts it to all participants.
 */
export async function recordRoomActivity(
  roomId: string,
  activityInfo: Omit<RoomActivityDto, "id" | "timestamp">,
): Promise<RoomActivityDto> {
  const redis = await getRedis();
  const activity: RoomActivityDto = {
    ...activityInfo,
    id: Date.now() + Math.random(),
    timestamp: Date.now(),
  };

  const listKey = `room:${roomId}:activity_logs`;
  await redis.rPush(listKey, JSON.stringify(activity));
  await redis.lTrim(listKey, 0, 49); // Keep latest 50 entries

  // Publish to connected SSE clients
  await publishRoom(roomId, {
    type: "room.activity",
    activity,
  });

  return activity;
}
