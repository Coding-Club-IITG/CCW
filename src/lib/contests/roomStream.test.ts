import { describe, expect, it } from "vitest";

import { parseRoomStreamMessage } from "@/lib/contests/roomStream";

const room = "507f1f77bcf86cd799439011";
const otherRoom = "507f1f77bcf86cd799439012";
const user = "507f1f77bcf86cd799439013";
describe("room event isolation", () => {
  it("accepts only the current room's events and scoped personal syncs", () => {
    const score = { type: "room.end", finalScores: { team: 80 } };
    expect(
      parseRoomStreamMessage(
        { channel: `events:room:${room}`, payload: score },
        room,
        user,
      ),
    ).toEqual(score);
    expect(
      parseRoomStreamMessage(
        { channel: `events:room:${otherRoom}`, payload: score },
        room,
        user,
      ),
    ).toBeNull();
    expect(
      parseRoomStreamMessage(
        {
          channel: `events:room:${room}`,
          payload: { ...score, roomId: otherRoom },
        },
        room,
        user,
      ),
    ).toBeNull();
    const sync = { type: "sync.failed", roomId: room, reason: "no-submission" };
    expect(
      parseRoomStreamMessage(
        { channel: `events:user:${user}`, payload: sync },
        room,
        user,
      ),
    ).toEqual(sync);
    for (const value of [
      {
        channel: `events:user:${user}`,
        payload: { ...sync, roomId: otherRoom },
      },
      { channel: `events:user:${user}`, payload: { type: "sync.queued" } },
      { channel: `events:user:${otherRoom}`, payload: sync },
      { channel: `events:contest:${room}`, payload: score },
      { channel: `events:room:${room}`, payload: { type: "room.advance" } },
      null,
    ])
      expect(parseRoomStreamMessage(value, room, user)).toBeNull();
  });
});
