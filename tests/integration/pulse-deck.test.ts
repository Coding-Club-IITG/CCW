import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as getDeck, PUT as putDeck } from "@/app/api/pulse/host/[quizId]/deck/route";
import { POST as acquire } from "@/app/api/pulse/host/[quizId]/lock/route";
import { defaultPulseConfig, type PulseSlide } from "@/lib/pulse/deckSchemas";
import { acquireEditorLock } from "@/lib/pulse/editorLock";
import PulseAuditEvent from "@/models/PulseAuditEvent";
import PulseQuiz from "@/models/PulseQuiz";
import User from "@/models/User";

import { clearTestMongo, startTestMongo, stopTestMongo } from "../utils/mongodb";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
// The test already holds an isolated connection; the app's own dbConnect would open another.
vi.mock("@/lib/mongodb", () => ({ dbConnect: async () => undefined, default: async () => undefined }));

const origin = "http://127.0.0.1:3000";
type Handler = (request: Request, context: any) => Promise<Response>;
const call = (handler: Handler, as: string, params: Record<string, string>, opts: { method?: string; body?: unknown; query?: string } = {}) =>
  handler(new Request(`${origin}/api/pulse/host${opts.query ?? ""}`, {
    method: opts.method ?? "GET", headers: { "content-type": "application/json", origin, "x-test-user": as },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  }), { params: Promise.resolve(params) });
const json = async (response: Response) => (await response.json()) as { ok: boolean; data?: any; error?: { code: string; fields?: Record<string, string[]> } };

type Member = { id: string; email: string };
const sessions = new Map<string, unknown>();
async function makeUser(email: string, access: "Member" | "Admin" = "Member"): Promise<Member> {
  const user = await User.create({ email, name: email.split("@")[0], access, roles: [{ position: "OC" }] });
  sessions.set(email, { user: { id: user.id, email, access }, session: { authProvider: "microsoft" } });
  return { id: user.id as string, email };
}
let counter = 0;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const roomCode = (n: number) => Array.from({ length: 6 }, (_, i) => ALPHABET[Math.floor(n / ALPHABET.length ** i) % ALPHABET.length]).join("");
async function makeQuiz(owner: Member, extra: Record<string, unknown> = {}) {
  counter += 1;
  const quiz = await PulseQuiz.create({
    title: `Quiz ${counter}`, roomCode: roomCode(counter), ownerId: owner.id, coHostIds: [],
    hostAssignments: [{ email: owner.email, role: "owner", userId: owner.id, assignedBy: owner.id }], ...extra,
  });
  return quiz._id.toString();
}
async function lock(quizId: string, as: string) {
  const result = await json(await call(acquire, as, { quizId }, { method: "POST" }));
  return result.data.lockToken as string;
}

const slides = (): PulseSlide[] => [
  { slideId: "s-info", order: 0, type: "info", content: { markdown: "# Welcome" } },
  { slideId: "s-mcq", order: 1, type: "mcq", content: { text: "2 + 2?", options: ["3", "4", "5"], correctOptions: [1], multipleAnswers: false, poll: false, points: 50, timerSeconds: 30 } },
  { slideId: "s-multi", order: 2, type: "mcq", content: { text: "Primes?", options: ["2", "3", "4"], correctOptions: [0, 1], multipleAnswers: true, poll: false, points: 100, timerSeconds: null } },
  { slideId: "s-poll", order: 3, type: "mcq", content: { text: "Favourite?", options: ["A", "B"], correctOptions: [], multipleAnswers: false, poll: true, points: 100, timerSeconds: null } },
];
const save = (quizId: string, as: string, lockToken: string, deckVersion: number, over: Record<string, unknown> = {}) =>
  call(putDeck, as, { quizId }, { method: "PUT", body: { deckVersion, lockToken, slides: slides(), ...defaultPulseConfig(), ...over } });

beforeAll(async () => {
  getSession.mockImplementation(async ({ headers }: { headers: Headers }) => sessions.get(headers.get("x-test-user") ?? "") ?? null);
  await startTestMongo();
  await Promise.all([User.init(), PulseQuiz.init(), PulseAuditEvent.init()]);
});
afterEach(async () => {
  sessions.clear();
  await clearTestMongo();
});
afterAll(stopTestMongo);

const expire = (id: string) => PulseQuiz.updateOne({ _id: id }, { $set: { "editorLock.expiresAt": new Date(Date.now() - 1000) } });
const auditCount = (id: string) => PulseAuditEvent.countDocuments({ quizId: id, type: "deck.saved" });
/** Runs `before` right before the next fenced write, i.e. after every earlier check has passed. */
function beforeNextWrite(before: () => Promise<void>) {
  const original = PulseQuiz.findOneAndUpdate.bind(PulseQuiz);
  vi.spyOn(PulseQuiz, "findOneAndUpdate").mockImplementationOnce(((...args: Parameters<typeof original>) => {
    const query = original(...args);
    const lean = query.lean.bind(query);
    query.lean = ((...rest: unknown[]) => before().then(() => (lean as (...a: unknown[]) => unknown)(...rest))) as never;
    return query;
  }) as never);
}

describe("deck save and reload", () => {
  it("round-trips Info and MCQ slides identically", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const id = await makeQuiz(a);
    const token = await lock(id, a.email);

    const before = await json(await call(getDeck, a.email, { quizId: id }));
    expect(before.data).toMatchObject({ editable: true, deckVersion: 0, slides: [] });

    // Out-of-order and sparse order values are normalized by the server.
    const sent = slides().map((slide, i) => ({ ...slide, order: [40, 10, 30, 20][i] }));
    const saved = await json(await save(id, a.email, token, 0, { slides: sent }));
    expect(saved).toMatchObject({ ok: true, data: { deckVersion: 1 } });
    const expected = [sent[1], sent[3], sent[2], sent[0]].map((slide, order) => ({ ...slide, order }));
    expect(saved.data.slides).toEqual(expected);

    const reloaded = await json(await call(getDeck, a.email, { quizId: id }));
    expect(reloaded.data.slides).toEqual(expected);
    expect(reloaded.data).toMatchObject({ deckVersion: 1, delivery: defaultPulseConfig().delivery, settings: defaultPulseConfig().settings });
    const stored = await PulseQuiz.findById(id).lean();
    expect(stored?.deckVersion).toBe(1);
    expect(stored?.slides.map((s) => s.slideId)).toEqual(expected.map((s) => s.slideId));
  });

  it("never returns a lock token and ignores client-sent ownership, role and lock fields", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in"), await makeUser("b@iitg.ac.in")];
    const id = await makeQuiz(a);
    const token = await lock(id, a.email);
    const response = await save(id, a.email, token, 0, {
      ownerId: b.id, role: "admin", status: "live", coHostIds: [b.id], editorLock: { lockedBy: b.id, token: "x" }, roomCode: "HACKED",
    });
    const saved = await json(response);
    expect(saved.ok).toBe(true);
    const stored = (await PulseQuiz.findById(id).lean())!;
    expect(stored.ownerId?.toString()).toBe(a.id);
    expect(stored.status).toBe("draft");
    expect(stored.coHostIds).toHaveLength(0);
    expect(stored.roomCode).not.toBe("HACKED");
    expect(stored.editorLock?.lockedBy?.toString()).toBe(a.id);
    const raw = JSON.stringify([saved, await json(await call(getDeck, a.email, { quizId: id }))]);
    expect(raw).not.toContain(token);
    expect(raw).not.toContain(stored.editorLock!.token);
  });

  it("rejects a stale version with a conflict and leaves the deck untouched", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const id = await makeQuiz(a);
    const token = await lock(id, a.email);
    expect((await json(await save(id, a.email, token, 0))).ok).toBe(true);
    const edited = slides().slice(0, 1);
    const stale = await json(await save(id, a.email, token, 0, { slides: edited }));
    expect(stale).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await PulseQuiz.findById(id).lean())).toMatchObject({ deckVersion: 1 });
    expect((await PulseQuiz.findById(id).lean())!.slides).toHaveLength(4);
    expect((await json(await save(id, a.email, token, 1, { slides: edited }))).data.deckVersion).toBe(2);
  });

  it("fences the write when the lock is taken over between the check and the write", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in"), await makeUser("b@iitg.ac.in")];
    const id = await makeQuiz(a, { coHostIds: [b.id], hostAssignments: [
      { email: a.email, role: "owner", userId: a.id, assignedBy: a.id }, { email: b.email, role: "cohost", userId: b.id, assignedBy: a.id }] });
    const token = await lock(id, a.email);
    beforeNextWrite(async () => {
      // A's lock lapses, then B legitimately takes it.
      await expire(id);
      expect((await acquireEditorLock(id, { userId: b.id })).acquired).toBe(true);
    });
    const result = await json(await save(id, a.email, token, 0));
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT", fields: { editorLock: expect.any(Array) } } });
    const stored = (await PulseQuiz.findById(id).lean())!;
    expect(stored.slides).toHaveLength(0);
    expect(stored.deckVersion ?? 0).toBe(0);
    expect(await auditCount(id)).toBe(0);
  });

  it("rejects an expired lock, and a stale token after a takeover, without a race", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in"), await makeUser("b@iitg.ac.in")];
    const id = await makeQuiz(a, { coHostIds: [b.id], hostAssignments: [
      { email: a.email, role: "owner", userId: a.id, assignedBy: a.id }, { email: b.email, role: "cohost", userId: b.id, assignedBy: a.id }] });
    const stale = await lock(id, a.email);
    await expire(id);
    // Expired but untaken: the fence still refuses it.
    expect((await json(await save(id, a.email, stale, 0))).error?.code).toBe("CONFLICT");
    const fresh = await lock(id, b.email);
    expect((await json(await save(id, a.email, stale, 0))).error?.code).toBe("CONFLICT");
    expect((await json(await save(id, a.email, fresh, 0))).error?.code).toBe("CONFLICT"); // B's token, A's session
    expect((await json(await save(id, b.email, fresh, 0))).ok).toBe(true);
    expect(await auditCount(id)).toBe(1);
  });

  it("rejects an invalid deck with field-path errors and writes nothing", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const id = await makeQuiz(a);
    const token = await lock(id, a.email);
    const broken = slides();
    broken[1] = { ...broken[1], content: { ...(broken[1].content as object), options: ["3", ""], correctOptions: [7], timerSeconds: 2 } } as PulseSlide;
    broken[2] = { ...broken[2], slideId: "s-info" };
    const config = defaultPulseConfig();
    const result = await json(await save(id, a.email, token, 0, {
      slides: broken, registration: { ...config.registration, allowGuests: true },
      delivery: { ...config.delivery, navigation: "free" },
    }));
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(result.error!.fields!).sort()).toEqual([
      "delivery.navigation", "registration.allowGuests", "slides.1.content.correctOptions.0", "slides.1.content.options.1",
      "slides.1.content.timerSeconds", "slides.2.slideId",
    ]);
    for (const empty of [[], [{ slideId: "x", order: 0, type: "video", content: {} }]]) {
      const bad = await json(await save(id, a.email, token, 0, { slides: empty }));
      expect(bad.error?.code).toBe("VALIDATION_ERROR");
      expect(Object.keys(bad.error!.fields!)[0]).toMatch(/^slides/);
    }
    expect((await json(await save(id, a.email, token, 0, { registration: { ...config.registration, maxParticipants: 501 } }))).error?.fields)
      .toHaveProperty(["registration.maxParticipants"]);
    expect((await json(await call(putDeck, a.email, { quizId: id }, { method: "PUT", body: { lockToken: token } }))).error?.code).toBe("VALIDATION_ERROR");
    const stored = (await PulseQuiz.findById(id).lean())!;
    expect(stored.slides).toHaveLength(0);
    expect(stored.deckVersion ?? 0).toBe(0);
  });

  it("rejects saves once the lobby has opened", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const id = await makeQuiz(a);
    const token = await lock(id, a.email);
    expect((await json(await save(id, a.email, token, 0))).ok).toBe(true);
    await PulseQuiz.updateOne({ _id: id }, { $set: { status: "lobby_open" } });
    expect(await json(await save(id, a.email, token, 1, { slides: slides().slice(0, 1) }))).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    const stored = (await PulseQuiz.findById(id).lean())!;
    expect(stored.slides).toHaveLength(4);
    expect(stored.deckVersion).toBe(1);
    expect((await json(await call(getDeck, a.email, { quizId: id }))).data.editable).toBe(false);
    expect(await auditCount(id)).toBe(1);
  });

  it("closes the status race at the write when the lobby opens after the checks", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const id = await makeQuiz(a);
    const token = await lock(id, a.email);
    beforeNextWrite(async () => { await PulseQuiz.updateOne({ _id: id }, { $set: { status: "lobby_open" } }); });
    expect((await json(await save(id, a.email, token, 0))).error?.code).toBe("CONFLICT");
    expect((await PulseQuiz.findById(id).lean())!.slides).toHaveLength(0);
    expect(await auditCount(id)).toBe(0);
  });

  it("rejects a token that was never issued", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const id = await makeQuiz(a);
    await lock(id, a.email);
    expect((await json(await save(id, a.email, "f".repeat(32), 0))).error?.code).toBe("CONFLICT");
  });

  it("never reports success when the write fails", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const id = await makeQuiz(a);
    const token = await lock(id, a.email);
    vi.spyOn(PulseQuiz, "findOneAndUpdate").mockReturnValueOnce({ lean: () => Promise.reject(new Error("write failed")) } as never);
    const failed = await json(await save(id, a.email, token, 0));
    expect(failed).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    expect((await PulseQuiz.findById(id).lean())!.slides).toHaveLength(0);
    expect(await auditCount(id)).toBe(0);
    // The draft is still saveable afterwards.
    expect((await json(await save(id, a.email, token, 0))).ok).toBe(true);
  });

  it("rolls the deck back when the audit event cannot be written", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const id = await makeQuiz(a);
    const token = await lock(id, a.email);
    vi.spyOn(PulseAuditEvent, "create").mockRejectedValueOnce(new Error("audit failed") as never);
    const failed = await json(await save(id, a.email, token, 0));
    expect(failed).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });
    const stored = (await PulseQuiz.findById(id).lean())!;
    expect(stored.slides).toHaveLength(0);
    expect(stored.deckVersion ?? 0).toBe(0);
    expect(await auditCount(id)).toBe(0);
    expect((await json(await save(id, a.email, token, 0))).data.deckVersion).toBe(1);
    expect(await auditCount(id)).toBe(1);
  });

  it("refuses to overwrite a stored deck that holds an unsupported slide type", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const _id = new mongoose.Types.ObjectId();
    await mongoose.connection.collection("pulse_quizzes").insertOne({
      _id, title: "Legacy", status: "draft", roomCode: "QAQ222", ownerId: new mongoose.Types.ObjectId(a.id), coHostIds: [], hostAssignments: [],
      slides: [{ slideId: "q", order: 0, type: "qa", content: { anonymous: true } }], createdAt: new Date(), updatedAt: new Date(),
    });
    const id = _id.toString();
    expect((await json(await call(getDeck, a.email, { quizId: id }))).error?.code).toBe("CONFLICT");
    const token = await lock(id, a.email);
    expect((await json(await save(id, a.email, token, 0))).error?.code).toBe("CONFLICT");
    expect((await PulseQuiz.findById(id).lean())!.slides).toMatchObject([{ slideId: "q", type: "qa" }]);
    expect(await auditCount(id)).toBe(0);
  });
});

describe("authorization", () => {
  it("rejects non-hosts, unassigned admins and anonymous callers", async () => {
    const [a, outsider, admin] = [await makeUser("a@iitg.ac.in"), await makeUser("x@iitg.ac.in"), await makeUser("admin@iitg.ac.in", "Admin")];
    const id = await makeQuiz(a);
    const token = await lock(id, a.email);
    for (const who of [outsider.email, admin.email]) {
      expect(await json(await save(id, who, token, 0))).toMatchObject({ ok: false, error: { code: "PULSE_NOT_HOST" } });
    }
    expect((await json(await save(id, "nobody@iitg.ac.in", token, 0))).error?.code).toBe("PULSE_NOT_AUTHORIZED");
    expect((await json(await call(getDeck, outsider.email, { quizId: id }))).error?.code).toBe("PULSE_NOT_HOST");
    expect((await json(await call(getDeck, "nobody@iitg.ac.in", { quizId: id }))).error?.code).toBe("PULSE_NOT_AUTHORIZED");
    expect((await json(await call(getDeck, admin.email, { quizId: id }))).error?.code).toBe("PULSE_NOT_HOST");
    expect((await PulseQuiz.findById(id).lean())!.slides).toHaveLength(0);
  });

  it("rejects cross-origin writes", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const id = await makeQuiz(a);
    const response = await putDeck(new Request(`${origin}/api/pulse/host`, {
      method: "PUT", headers: { "content-type": "application/json", origin: "https://evil.example", "x-test-user": a.email }, body: "{}",
    }), { params: Promise.resolve({ quizId: id }) });
    expect((await json(response)).error?.code).toBe("PULSE_NOT_AUTHORIZED");
  });
});

describe("loading stored decks", () => {
  it("loads a Phase 1 document with defaults and lets the first save overwrite it", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const _id = new mongoose.Types.ObjectId();
    await mongoose.connection.collection("pulse_quizzes").insertOne({
      _id, title: "Old", status: "scheduled", roomCode: "OLD222", ownerId: new mongoose.Types.ObjectId(a.id), coHostIds: [], hostAssignments: [],
      delivery: { mode: "host-paced", navigation: "sequential", displayMode: "full-prompt" },
      settings: { timer: { overallEnabled: true, overallDurationSeconds: 1800, perQuestionEnabled: true } },
      slides: [
        { slideId: "s2", order: 1, type: "mcq", content: { text: "2+2?", options: ["3", "4"], correctOptions: [1], multipleAnswers: false, poll: false, points: 100 } },
        { slideId: "s1", order: 0, type: "info", content: {} },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    });
    const id = _id.toString();
    const deck = (await json(await call(getDeck, a.email, { quizId: id }))).data;
    expect(deck).toMatchObject({
      deckVersion: 0, editable: true,
      settings: { timer: { overallDurationSeconds: 1800 }, leaderboard: { enabled: true }, randomization: { enabled: false } },
      registration: { allowGuests: false, maxParticipants: 500 },
    });
    expect(deck.slides.map((s: PulseSlide) => [s.slideId, s.order])).toEqual([["s1", 0], ["s2", 1]]);

    const token = await lock(id, a.email);
    const result = await json(await save(id, a.email, token, 0));
    expect(result).toMatchObject({ ok: true, data: { deckVersion: 1 } });
  });

  it("falls back to defaults for an unreadable config section", async () => {
    const a = await makeUser("a@iitg.ac.in");
    const _id = new mongoose.Types.ObjectId();
    await mongoose.connection.collection("pulse_quizzes").insertOne({
      _id, title: "Odd", status: "draft", roomCode: "ODD222", ownerId: new mongoose.Types.ObjectId(a.id), coHostIds: [],
      delivery: { mode: "host-paced", navigation: "sequential", displayMode: "legacy-mode" }, slides: [], createdAt: new Date(), updatedAt: new Date(),
    });
    const deck = (await json(await call(getDeck, a.email, { quizId: _id.toString() }))).data;
    expect(deck.delivery.displayMode).toBe("full-prompt");
  });
});
