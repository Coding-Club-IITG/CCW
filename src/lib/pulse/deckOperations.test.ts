import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/pulse/host/[quizId]/deck/operations/route";
import { requirePulseHost } from "@/lib/api/pulse";
import { err, ok } from "@/lib/api/result";
import { recordAudit } from "@/lib/pulse/audit";
import { defaultPulseConfig, type PulseSlide } from "@/lib/pulse/deckSchemas";
import PulseQuiz from "@/models/PulseQuiz";

vi.mock("@/lib/mongodb", () => ({ dbConnect: vi.fn() }));
vi.mock("@/lib/api/auth", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/pulse/hostAssignments", () => ({ linkHostAssignmentsForUser: vi.fn() }));
vi.mock("@/lib/api/pulse", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/pulse")>(),
  requirePulseHost: vi.fn(),
}));
vi.mock("@/lib/pulse/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/utils", () => ({ logger: { error: vi.fn() }, errorToLogMetadata: () => ({}) }));

const quizId = "111111111111111111111111";
const userId = "222222222222222222222222";
const lockToken = "a".repeat(32);
const origin = "http://127.0.0.1:3000";
const info = { slideId: "info", order: 0, type: "info" as const, content: { markdown: "Welcome" } };
const mcq = {
  slideId: "mcq", order: 1, type: "mcq" as const,
  content: { text: "2+2?", options: ["3", "4"], correctOptions: [1], multipleAnswers: false, poll: false, points: 100, timerSeconds: null },
};
const fixture = () => ({
  ...defaultPulseConfig(), status: "draft", deckVersion: 0, slides: [structuredClone(info), structuredClone(mcq)] as PulseSlide[],
  editorLock: { lockedBy: new mongoose.Types.ObjectId(userId), token: lockToken, expiresAt: new Date(Date.now() + 60_000) },
});
let quiz: ReturnType<typeof fixture>;
let write: ReturnType<typeof vi.spyOn>;

async function command(operations: unknown, extra: object = {}, requestOrigin = origin) {
  return POST(new Request(`${origin}/api/pulse/host/${quizId}/deck/operations`, {
    method: "POST", headers: { origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify({ lockToken, deckVersion: 0, operations, ...extra }),
  }), { params: Promise.resolve({ quizId }) });
}

beforeEach(() => {
  quiz = fixture();
  vi.mocked(requirePulseHost).mockImplementation(async () => ok({ quiz: quiz as never, role: "owner", userId }));
  vi.spyOn(mongoose.connection, "transaction").mockImplementation(async (run) => run({} as never));
  write = vi.spyOn(PulseQuiz, "findOneAndUpdate").mockImplementation((_filter, update) => ({
    lean: async () => {
      const change = update as { $set: Partial<typeof quiz> };
      Object.assign(quiz, change.$set, { deckVersion: quiz.deckVersion + 1 });
      return quiz;
    },
  }) as never);
});

describe("Phase 2.3 explicit slide-operation saves (mocked database)", () => {
  it.each(["owner", "cohost"] as const)("lets an authorized %s save all operations together", async (role) => {
    vi.mocked(requirePulseHost).mockImplementation(async () => role === "owner"
      ? ok({ quiz: quiz as never, role: "owner", userId })
      : ok({ quiz: quiz as never, role: "cohost", userId }));
    const response = await command([
      { operation: "create", slide: { type: "info", content: { markdown: "New" } }, atIndex: 1 },
      { operation: "update", slideId: "mcq", content: { ...mcq.content, text: "Updated", options: ["4", "5"], correctOptions: [0] } },
      { operation: "duplicate", slideId: "mcq" },
      { operation: "delete", slideId: "info" },
    ]);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.data.deckVersion).toBe(1);
    expect(result.data.slides.map((slide: PulseSlide) => slide.order)).toEqual([0, 1, 2]);
    expect(result.data.slides[0]).toMatchObject({ type: "info", content: { markdown: "New" } });
    expect(result.data.slides[1]).toMatchObject({ slideId: "mcq", content: { text: "Updated", correctOptions: [0] } });
    expect(result.data.slides[2].content).toEqual(result.data.slides[1].content);
    expect(new Set(result.data.slides.map((slide: PulseSlide) => slide.slideId)).size).toBe(3);
    expect(JSON.stringify(result)).not.toContain(lockToken);
    expect(write).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledTimes(1);
  });

  it("creates MCQs using shared schema defaults and preserves configuration", async () => {
    const response = await command([{ operation: "create", slide: { type: "mcq", content: { text: "Pick", options: ["A", "B"], correctOptions: [0] } } }]);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data.slides[2]).toMatchObject({ type: "mcq", order: 2, content: { points: 100, poll: false, multipleAnswers: false, timerSeconds: null } });
    expect({ delivery: data.delivery, settings: data.settings, registration: data.registration }).toEqual(defaultPulseConfig());
    expect(data.slides.slice(0, 2)).toEqual([info, mcq]);
  });

  it("updates Info content and duplicates it under a fresh ID", async () => {
    const response = await command([{ operation: "update", slideId: "info", content: { markdown: "Changed" } }, { operation: "duplicate", slideId: "info" }]);
    const { data } = await response.json();
    expect(data.slides[0]).toEqual({ ...info, content: { markdown: "Changed" } });
    expect(data.slides[1]).toMatchObject({ type: "info", content: { markdown: "Changed" }, order: 1 });
    expect(data.slides[1].slideId).not.toBe("info");
    expect(data.slides[2].slideId).toBe("mcq");
  });

  it("removes deleted slides from leaderboard triggers", async () => {
    quiz.settings.leaderboard.showAfterQuestions = ["info", "mcq"];
    expect((await command([{ operation: "delete", slideId: "mcq" }])).status).toBe(200);
    expect(quiz.settings.leaderboard.showAfterQuestions).toEqual(["info"]);
  });

  it.each([
    [{ operation: "create", slide: { type: "qa", content: {} } }],
    [{ operation: "create", slide: { type: "info", slideId: "forged", content: { markdown: "X" } } }],
    [{ operation: "create", slide: { type: "info", content: { markdown: "" } } }],
    [{ operation: "create", slide: { type: "info", content: { markdown: "X" } }, atIndex: 99 }],
    [{ operation: "update", slideId: "mcq", content: { ...mcq.content, correctOptions: [99] } }],
    [{ operation: "update", slideId: "info", content: { text: "Wrong type" } }],
    [{ operation: "update", slideId: "info", content: { markdown: "X" }, type: "mcq" }],
    [{ operation: "unknown" }],
    [],
  ])("rejects invalid commands without writing: %j", async (...operations) => {
    const response = await command(operations);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["update", "delete", "duplicate"])("rejects %s for a missing slide", async (operation) => {
    const response = await command([{ operation, slideId: "missing", ...(operation === "update" ? { content: info.content } : {}) }]);
    expect(response.status).toBe(404);
    expect(write).not.toHaveBeenCalled();
  });

  it("validates the complete resulting deck before any write", async () => {
    const response = await command([{ operation: "delete", slideId: "info" }, { operation: "delete", slideId: "mcq" }]);
    expect(response.status).toBe(400);
    expect(quiz.slides).toEqual([info, mcq]);
    expect(write).not.toHaveBeenCalled();
  });

  it("leaves the saved deck unchanged when a later operation fails", async () => {
    const response = await command([
      { operation: "delete", slideId: "info" },
      { operation: "update", slideId: "mcq", content: { ...mcq.content, correctOptions: [99] } },
    ]);
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toHaveProperty(["operations.1.content.correctOptions.0"]);
    expect(quiz.slides).toEqual([info, mcq]);
    expect(write).not.toHaveBeenCalled();
  });

  it("supports replacing the last slide within one save", async () => {
    quiz.slides = [structuredClone(info)];
    expect((await command([
      { operation: "delete", slideId: "info" },
      { operation: "create", slide: { type: "info", content: { markdown: "Replacement" } } },
    ])).status).toBe(200);
    expect(quiz.slides).toHaveLength(1);
    expect(quiz.slides[0]).toMatchObject({ order: 0, content: { markdown: "Replacement" } });
  });

  it("keeps duplicate MCQ content independent of subsequent source edits", async () => {
    expect((await command([
      { operation: "duplicate", slideId: "mcq" },
      { operation: "update", slideId: "mcq", content: { ...mcq.content, options: ["5", "6"], correctOptions: [0] } },
    ])).status).toBe(200);
    expect(quiz.slides[2].content).toEqual(mcq.content);
    expect(quiz.slides[1].content).toMatchObject({ options: ["5", "6"], correctOptions: [0] });
  });

  it("enforces quiz-level timer compatibility through whole-deck validation", async () => {
    quiz.delivery.mode = "participant-paced";
    quiz.settings.timer.perQuestionEnabled = false;
    const response = await command([{ operation: "update", slideId: "mcq", content: { ...mcq.content, timerSeconds: 30 } }]);
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ "operations.0.content.timerSeconds": ["Question timers need host-paced delivery."] });
    expect(write).not.toHaveBeenCalled();
  });

  it("maps final-deck errors to creates despite shifted slide positions", async () => {
    quiz.delivery.mode = "participant-paced";
    quiz.settings.timer.perQuestionEnabled = false;
    const response = await command([
      { operation: "duplicate", slideId: "info" },
      { operation: "create", slide: { type: "mcq", content: { ...mcq.content, timerSeconds: 30 } }, atIndex: 0 },
      { operation: "delete", slideId: "info" },
    ]);
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ "operations.1.slide.content.timerSeconds": ["Question timers need host-paced delivery."] });
    expect(write).not.toHaveBeenCalled();
  });

  it("attributes final-deck errors to the last update of a stable slide ID", async () => {
    quiz.delivery.mode = "participant-paced";
    quiz.settings.timer.perQuestionEnabled = false;
    const response = await command([
      { operation: "update", slideId: "mcq", content: { ...mcq.content, timerSeconds: 10 } },
      { operation: "delete", slideId: "info" },
      { operation: "update", slideId: "mcq", content: { ...mcq.content, timerSeconds: 30 } },
    ]);
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({ "operations.2.content.timerSeconds": ["Question timers need host-paced delivery."] });
    expect(write).not.toHaveBeenCalled();
  });

  it("maps invalid duplicate content to its source selection and retains untouched-slide errors", async () => {
    quiz.delivery.mode = "participant-paced";
    quiz.settings.timer.perQuestionEnabled = false;
    quiz.slides[1] = { ...mcq, content: { ...mcq.content, timerSeconds: 30 } };
    const response = await command([{ operation: "duplicate", slideId: "mcq" }]);
    expect(response.status).toBe(400);
    expect((await response.json()).error.fields).toEqual({
      "slides.1.content.timerSeconds": ["Question timers need host-paced delivery."],
      "operations.0.slideId": ["Question timers need host-paced delivery."],
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("refuses stored unsupported slides rather than rewriting them", async () => {
    quiz.slides = [{ slideId: "legacy", order: 0, type: "qa", content: {} }] as never;
    expect((await command([{ operation: "delete", slideId: "legacy" }])).status).toBe(409);
    expect(write).not.toHaveBeenCalled();
  });

  it.each([{ lockToken: undefined }, { lockToken: "invalid" }, { deckVersion: undefined }])("requires a lock token and version: %j", async (extra) => {
    expect((await command([{ operation: "delete", slideId: "info" }], extra)).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });

  it("returns a structured error for malformed JSON", async () => {
    const response = await POST(new Request(`${origin}/api/pulse/host/${quizId}/deck/operations`, {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: "{",
    }), { params: Promise.resolve({ quizId }) });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["lobby_open", "live", "paused", "interaction_locked", "completed", "cancelled", "archived"])("rejects edits in %s", async (status) => {
    quiz.status = status;
    expect((await command([{ operation: "delete", slideId: "info" }])).status).toBe(409);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["expired", "wrong-holder", "wrong-token"])("rejects a %s lock", async (kind) => {
    if (kind === "expired") quiz.editorLock.expiresAt = new Date(0);
    if (kind === "wrong-holder") quiz.editorLock.lockedBy = new mongoose.Types.ObjectId();
    if (kind === "wrong-token") quiz.editorLock.token = "b".repeat(32);
    expect((await command([{ operation: "delete", slideId: "info" }])).status).toBe(409);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["expired", "wrong-holder", "wrong-token", "missing"])("prioritizes a %s lock over stale versions and invalid operations", async (kind) => {
    if (kind === "expired") quiz.editorLock.expiresAt = new Date(0);
    if (kind === "wrong-holder") quiz.editorLock.lockedBy = new mongoose.Types.ObjectId();
    if (kind === "wrong-token") quiz.editorLock.token = "b".repeat(32);
    if (kind === "missing") delete (quiz as Partial<typeof quiz>).editorLock;
    for (const operations of [
      [{ operation: "delete", slideId: "info" }],
      [{ operation: "create", slide: { type: "qa", content: {} } }],
      [{ operation: "update", slideId: "mcq", content: { ...mcq.content, correctOptions: [99] } }],
    ]) {
      const response = await command(operations, { deckVersion: 99 });
      expect(response.status).toBe(409);
      expect((await response.json()).error).toMatchObject({
        code: "CONFLICT", fields: { editorLock: ["You no longer hold the editor lock."] },
      });
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects stale versions and client authorization claims", async () => {
    expect((await command([{ operation: "delete", slideId: "info" }], { deckVersion: 1 })).status).toBe(409);
    expect((await command([{ operation: "delete", slideId: "info" }], { ownerId: userId, role: "owner" })).status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });

  it.each(["PULSE_NOT_HOST", "PULSE_NOT_AUTHORIZED"] as const)("preserves authorization denial: %s", async (code) => {
    vi.mocked(requirePulseHost).mockResolvedValue(err(code, "Access denied."));
    expect((await command([{ operation: "delete", slideId: "info" }])).status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });

  it("rechecks authorization before saving", async () => {
    vi.mocked(requirePulseHost).mockResolvedValueOnce(ok({ quiz: quiz as never, role: "cohost", userId })).mockResolvedValueOnce(err("PULSE_NOT_HOST", "Assignment removed."));
    expect((await command([{ operation: "delete", slideId: "info" }])).status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });

  it("uses the existing atomic fence and returns a conflict when it loses a race", async () => {
    write.mockReturnValueOnce({ lean: async () => null });
    vi.spyOn(PulseQuiz, "findById").mockReturnValue({ select: () => ({ lean: async () => quiz }) } as never);
    expect((await command([{ operation: "delete", slideId: "info" }])).status).toBe(409);
    expect(write.mock.calls[0][0]).toMatchObject({
      status: { $in: ["draft", "scheduled"] },
      "editorLock.lockedBy": new mongoose.Types.ObjectId(userId),
      "editorLock.token": lockToken,
      "editorLock.expiresAt": { $gt: expect.any(Date) },
      $or: [{ deckVersion: 0 }, { deckVersion: { $exists: false } }],
    });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("never reports success on a failed write", async () => {
    write.mockReturnValueOnce({ lean: async () => { throw new Error("Database unavailable"); } });
    expect((await command([{ operation: "delete", slideId: "info" }])).status).toBe(503);
    expect(quiz.slides).toEqual([info, mcq]);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("keeps origin protection and private response caching rules", async () => {
    const denied = await command([{ operation: "delete", slideId: "info" }], {}, "https://evil.example");
    expect(denied.status).toBe(403);
    expect(write).not.toHaveBeenCalled();
    const allowed = await command([{ operation: "delete", slideId: "info" }]);
    expect(allowed.headers.get("cache-control")).toBe("no-store");
  });
});
