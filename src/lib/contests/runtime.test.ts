import { describe, expect, it } from "vitest";

import {
  cfSyncJobDataSchema,
  reconciliationJobDataSchema,
  contestRoomStateSchema,
  roomStreamEventSchema,
} from "@/lib/contests/runtime";

describe("contest runtime boundaries", () => {
  it("validates room and contest IDs for reconciliation jobs", () => {
    expect(
      reconciliationJobDataSchema.safeParse({
        contestId: "507f1f77bcf86cd799439011",
      }).success,
    ).toBe(true);
    expect(
      reconciliationJobDataSchema.safeParse({ roomId: "invalid" }).success,
    ).toBe(false);
  });

  it("validates BullMQ sync jobs before worker use", () => {
    expect(
      cfSyncJobDataSchema.safeParse({
        roomId: "507f1f77bcf86cd799439011",
        userId: "507f191e810c19729de860ea",
        teamId: "507f1f77bcf86cd799439012",
        cfHandle: "tourist",
        problemId: "4A",
      }).success,
    ).toBe(true);
    expect(cfSyncJobDataSchema.safeParse({ roomId: "invalid" }).success).toBe(
      false,
    );
  });

  it("preserves Redis hash extensions while typing known state", () => {
    expect(
      contestRoomStateSchema.parse({
        status: "active",
        startTime: "1787563200000",
        readyCount: "2",
      }),
    ).toEqual({
      status: "active",
      startTime: "1787563200000",
      readyCount: "2",
    });
  });

  it("rejects incomplete room events", () => {
    expect(
      roomStreamEventSchema.safeParse({
        type: "room.state_sync",
        scores: { team: 1 },
      }).success,
    ).toBe(false);
  });
});
