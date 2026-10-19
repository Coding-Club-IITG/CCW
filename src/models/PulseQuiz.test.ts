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
    expect(quiz.registration?.allowGuests).toBe(false);
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

  it("requires an owner and roomCode", async () => {
    await expect(new PulseQuiz({}).validate()).rejects.toThrow();
    await expect(new PulseQuiz({ roomCode: "A7K9P2" }).validate()).rejects.toThrow();
    const pending = new PulseQuiz({
      roomCode: "A7K9P2",
      hostAssignments: [{ email: "host@iitg.ac.in", role: "owner", assignedBy: id() }],
    });
    await expect(pending.validate()).resolves.toBeUndefined();
    expect(pending.ownerId).toBeNull();
  });

  it("rejects duplicate owners, normalized host emails and mismatched linked owners", async () => {
    const owner = { email: "host@iitg.ac.in", role: "owner", assignedBy: id() };
    for (const hostAssignments of [
      [owner, { ...owner, email: "other@iitg.ac.in" }],
      [owner, { ...owner, email: " HOST@iitg.ac.in ", role: "cohost" }],
      [{ ...owner, userId: id() }],
    ]) await expect(minimal({ hostAssignments }).validate()).rejects.toThrow();
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

  it("defaults to full scoring and accepts time-based scoring with its timers", async () => {
    const quiz = minimal();
    await quiz.validate();
    expect(quiz.settings?.scoring?.mode).toBe("full");
    await expect(minimal({ settings: { scoring: { mode: "time_based" } } }).validate()).resolves.toBeUndefined();
    await expect(minimal({ settings: { scoring: { mode: "speed_sensitive" } } }).validate()).rejects.toThrow();
  });

  it("rejects time-based scoring without a timer to measure against", async () => {
    const hostPaced = minimal({ settings: { timer: { perQuestionEnabled: false }, scoring: { mode: "time_based" } } });
    await expect(hostPaced.validate()).rejects.toThrow(/per-question timers/i);
    const participantPaced = minimal({
      delivery: { mode: "participant-paced" },
      settings: { timer: { perQuestionEnabled: false, overallEnabled: false }, scoring: { mode: "time_based" } },
    });
    await expect(participantPaced.validate()).rejects.toThrow(/overall timer/i);
  });

  it("applies the editor's configuration rules to every write", async () => {
    for (const extra of [
      { delivery: { mode: "host-paced", navigation: "free" } },
      { delivery: { mode: "participant-paced", displayMode: "answer-controller", navigation: "free" }, settings: { timer: { perQuestionEnabled: false } } },
      { delivery: { displayMode: "projector" } },
      { registration: { allowGuests: true } },
      { registration: { maxParticipants: 501 } },
      { settings: { timer: { overallDurationSeconds: 1.5 } } },
    ]) await expect(minimal(extra).validate()).rejects.toThrow();
  });

  it("validates slides: typed content, unique IDs, whole-number order", async () => {
    const mcq = { text: "2+2?", options: ["3", "4"], correctOptions: [1], multipleAnswers: false, poll: false, points: 100, timerSeconds: null };
    const info = { slideId: "s1", order: 0, type: "info", content: { markdown: "# Hi" } };
    const good = [info, { slideId: "s2", order: 1, type: "mcq", content: mcq }];
    await expect(minimal({ slides: good }).validate()).resolves.toBeUndefined();

    for (const slides of [
      [info, { ...info, order: 1 }],
      [{ ...info, order: 0.5 }],
      [{ slideId: "s2", order: 0, type: "mcq", content: { ...mcq, correctOptions: [9] } }],
      [{ slideId: "s2", order: 0, type: "mcq", content: { ...mcq, points: 101 } }],
      [{ slideId: "s2", order: 0, type: "mcq", content: { text: "No options" } }],
      [{ slideId: "s1", order: 0, type: "info", content: { markdown: "ok", extra: true } }],
    ]) await expect(minimal({ slides }).validate()).rejects.toThrow();
  });

  it("keeps Phase 1 placeholder slides with empty content valid", async () => {
    const slides = [
      { slideId: "s1", order: 0, type: "info" },
      { slideId: "s2", order: 1, type: "mcq", content: {} },
    ];
    await expect(minimal({ slides }).validate()).resolves.toBeUndefined();
  });

  it("only re-checks the configuration when it changes", async () => {
    const quiz = minimal();
    await quiz.validate();
    quiz.isNew = false;
    quiz.$set("settings.scoring.mode", "time_based");
    quiz.$set("settings.timer.perQuestionEnabled", true);
    quiz.markModified("title");
    await expect(quiz.validate()).resolves.toBeUndefined();
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
      { "schedule.scheduledAt": 1 },
      { status: 1, "schedule.scheduledAt": 1 },
    ]) {
      expect(indexes).toContainEqual([key, expect.anything()]);
    }
  });
});
