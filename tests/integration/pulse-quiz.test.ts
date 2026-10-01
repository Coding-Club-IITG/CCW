import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { recordAudit } from "@/lib/pulse/audit";
import {
  RoomCodeExhaustedError,
  withUniqueRoomCode,
} from "@/lib/pulse/roomCode";
import PulseAuditEvent from "@/models/PulseAuditEvent";
import PulseQuiz from "@/models/PulseQuiz";

import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const id = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startTestMongo();
  // Build indexes up front so the unique roomCode constraint is enforced.
  await PulseQuiz.init();
  await PulseAuditEvent.init();
});
afterEach(clearTestMongo);
afterAll(stopTestMongo);

describe("PulseQuiz persistence", () => {
  it("saves a minimal quiz as a draft", async () => {
    const quiz = await PulseQuiz.create({ ownerId: id(), roomCode: "A7K9P2" });
    const found = await PulseQuiz.findById(quiz._id).lean();
    expect(found?.status).toBe("draft");
    expect(found?.registration?.maxParticipants).toBe(500);
    expect(found?.registration?.allowLateJoin).toBe(false);
    expect(found?.createdAt).toBeInstanceOf(Date);
    expect(found?.updatedAt).toBeInstanceOf(Date);
  });

  it("rejects a duplicate roomCode at the database", async () => {
    await PulseQuiz.create({ ownerId: id(), roomCode: "A7K9P2" });
    await expect(
      PulseQuiz.create({ ownerId: id(), roomCode: "A7K9P2" }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("stores host assignments with normalized emails", async () => {
    const quiz = await PulseQuiz.create({
      ownerId: id(),
      roomCode: "B8M3Q4",
      hostAssignments: [
        { email: "Host@Example.com", role: "cohost", assignedBy: id() },
      ],
    });
    const found = await PulseQuiz.findOne({
      "hostAssignments.email": "host@example.com",
    });
    expect(found?._id.equals(quiz._id)).toBe(true);
  });
});

describe("withUniqueRoomCode against a real collision", () => {
  it("retries past an existing code", async () => {
    await PulseQuiz.create({ ownerId: id(), roomCode: "AAAAAA" });
    const codes = ["AAAAAA", "BBBBBB"];
    const quiz = await withUniqueRoomCode(
      (roomCode) => PulseQuiz.create({ ownerId: id(), roomCode }),
      { generate: () => codes.shift()! },
    );
    expect(quiz.roomCode).toBe("BBBBBB");
    expect(await PulseQuiz.countDocuments()).toBe(2);
  });

  it("gives up cleanly when retries run out", async () => {
    await PulseQuiz.create({ ownerId: id(), roomCode: "AAAAAA" });
    await expect(
      withUniqueRoomCode(
        (roomCode) => PulseQuiz.create({ ownerId: id(), roomCode }),
        { maxAttempts: 3, generate: () => "AAAAAA" },
      ),
    ).rejects.toBeInstanceOf(RoomCodeExhaustedError);
    expect(await PulseQuiz.countDocuments()).toBe(1);
  });
});

describe("recordAudit persistence", () => {
  it("saves each supported event type", async () => {
    const quizId = id();
    const actor = { userId: id(), role: "owner" as const };
    for (const type of [
      "quiz.created",
      "host.assigned",
      "host.removed",
      "host.linked",
    ] as const) {
      await recordAudit({ quizId, type, actor, metadata: { email: "a@b.co" } });
    }
    const events = await PulseAuditEvent.find({ quizId }).sort({
      createdAt: 1,
    });
    expect(events.map((e) => e.type)).toHaveLength(4);
    expect(new Set(events.map((e) => e.type)).size).toBe(4);
  });

  it("rejects unknown types and secret metadata without saving", async () => {
    const quizId = id();
    const actor = { userId: id(), role: "owner" as const };
    await expect(
      recordAudit({ quizId, type: "quiz.exploded" as never, actor }),
    ).rejects.toThrow();
    await expect(
      recordAudit({
        quizId,
        type: "quiz.created",
        actor,
        metadata: { passwordHash: "x" },
      }),
    ).rejects.toThrow();
    expect(await PulseAuditEvent.countDocuments({ quizId })).toBe(0);
  });
});
