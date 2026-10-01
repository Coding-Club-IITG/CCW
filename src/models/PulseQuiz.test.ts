import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import PulseQuiz from "@/models/PulseQuiz";

const id = () => new mongoose.Types.ObjectId();
const minimal = (extra: Record<string, unknown> = {}) =>
  new PulseQuiz({ ownerId: id(), roomCode: "A7K9P2", ...extra });

describe("PulseQuiz", () => {
  it("accepts a minimal draft and applies defaults", async () => {
    const quiz = minimal();
    await expect(quiz.validate()).resolves.toBeUndefined();
    expect(quiz.status).toBe("draft");
    expect(quiz.registration?.maxParticipants).toBe(500);
    expect(quiz.registration?.allowLateJoin).toBe(false);
    expect(quiz.slides).toHaveLength(0);
    expect(quiz.hostAssignments).toHaveLength(0);
    expect(quiz.participantCount).toBe(0);
    expect(quiz.checkpoint?.lastCompletedSlideIndex).toBe(-1);
  });

  it.each([
    "draft",
    "scheduled",
    "lobby_open",
    "live",
    "paused",
    "interaction_locked",
    "completed",
    "cancelled",
    "archived",
  ])("accepts status %s", async (status) => {
    await expect(minimal({ status }).validate()).resolves.toBeUndefined();
  });

  it("rejects an unknown status", async () => {
    await expect(minimal({ status: "finished" }).validate()).rejects.toThrow();
  });

  it("requires ownerId and roomCode", async () => {
    await expect(new PulseQuiz({}).validate()).rejects.toThrow();
  });

  it("uppercases room codes and rejects malformed ones", async () => {
    const quiz = minimal({ roomCode: "a7k9p2" });
    await quiz.validate();
    expect(quiz.roomCode).toBe("A7K9P2");
    for (const roomCode of ["A7K9P0", "A7K9PI", "SHORT", "A7K9P23"]) {
      await expect(minimal({ roomCode }).validate()).rejects.toThrow();
    }
  });

  it("validates host assignments", async () => {
    const assignedBy = id();
    const ok = minimal({
      hostAssignments: [
        { email: " Host@Example.COM ", role: "cohost", assignedBy },
      ],
    });
    await expect(ok.validate()).resolves.toBeUndefined();
    expect(ok.hostAssignments[0].email).toBe("host@example.com");
    expect(ok.hostAssignments[0].assignedAt).toBeInstanceOf(Date);

    const badRole = minimal({
      hostAssignments: [{ email: "a@b.co", role: "admin", assignedBy }],
    });
    await expect(badRole.validate()).rejects.toThrow();

    const noAssigner = minimal({
      hostAssignments: [{ email: "a@b.co", role: "owner" }],
    });
    await expect(noAssigner.validate()).rejects.toThrow();
  });

  it("rejects per-question timers in participant-paced mode", async () => {
    const bad = minimal({ delivery: { mode: "participant-paced" } });
    await expect(bad.validate()).rejects.toThrow(/host-paced/);

    const ok = minimal({
      delivery: { mode: "participant-paced" },
      settings: { timer: { perQuestionEnabled: false } },
    });
    await expect(ok.validate()).resolves.toBeUndefined();
  });

  it("rejects an invalid slide type", async () => {
    const quiz = minimal({
      slides: [{ slideId: "s1", order: 0, type: "video" }],
    });
    await expect(quiz.validate()).rejects.toThrow();
  });

  it("defines the required indexes", () => {
    const indexes = PulseQuiz.schema.indexes();
    expect(indexes).toContainEqual([
      { roomCode: 1 },
      expect.objectContaining({ unique: true }),
    ]);
    for (const key of [
      { status: 1 },
      { "hostAssignments.email": 1 },
      { ownerId: 1 },
      { coHostIds: 1 },
    ]) {
      expect(indexes).toContainEqual([key, expect.anything()]);
    }
  });
});
