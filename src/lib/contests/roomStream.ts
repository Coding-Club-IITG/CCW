import { roomStreamEventSchema } from "@/lib/contests/runtime";

export function parseRoomStreamMessage(
  value: unknown,
  roomId: string,
  userId: string,
) {
  if (
    !value ||
    typeof value !== "object" ||
    !("channel" in value) ||
    !("payload" in value)
  ) {
    return null;
  }

  const result = roomStreamEventSchema.safeParse(value.payload);

  if (!result.success) {
    return null;
  }

  const payload = result.data;

  if (payload.roomId !== undefined && payload.roomId !== roomId) {
    return null;
  }

  if (
    value.channel === `events:room:${roomId}` ||
    (value.channel === `events:user:${userId}` && payload.roomId === roomId)
  ) {
    return payload;
  }

  return null;
}
