import { describe, expect, it } from "vitest";

import {
  cfSyncJobDataSchema,
  contestRoomStateSchema,
  contestSubmissionEventSchema,
  roomStreamEventSchema,
} from "@/lib/contests/runtime";

describe("contest runtime boundaries", () => {
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
        type: "room.advance",
        problemIndex: 1,
      }).success,
    ).toBe(false);
  });

  it("validates persisted submission stream records", () => {
    expect(
      contestSubmissionEventSchema.safeParse({
        userId: "507f191e810c19729de860ea",
        teamId: "507f1f77bcf86cd799439012",
        problemId: "4A",
        cfSubmissionId: 123,
        verdict: "OK",
        points: 100,
        solveMs: 5000,
        cfTimestamp: 1787563200000,
      }).success,
    ).toBe(true);
  });
});
