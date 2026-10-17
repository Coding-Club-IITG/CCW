import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as createQuiz } from "@/app/api/admin/pulse/route";
import { POST as addCoHost } from "@/app/api/admin/pulse/[quizId]/cohosts/route";
import { GET as getDeck, PUT as putDeck } from "@/app/api/pulse/host/[quizId]/deck/route";
import { POST as acquire } from "@/app/api/pulse/host/[quizId]/lock/route";
import { defaultPulseConfig, type PulseSlide } from "@/lib/pulse/deckSchemas";
import PulseAuditEvent from "@/models/PulseAuditEvent";
import PulseQuiz from "@/models/PulseQuiz";
import User from "@/models/User";

import { clearTestMongo, startTestMongo, stopTestMongo } from "../utils/mongodb";

// Definition of Done for Pulse 2.1, exercised end to end against MongoDB only.

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
// The test already holds an isolated connection; the app's own dbConnect would open another.
vi.mock("@/lib/mongodb", () => ({ dbConnect: async () => undefined, default: async () => undefined }));

const origin = "http://127.0.0.1:3000";
type Handler = (request: Request, context: any) => Promise<Response>;
type Body = { ok: boolean; data?: any; error?: { code: string; fields?: Record<string, string[]> } };
const call = async (handler: Handler, as: string, params: Record<string, string> = {}, opts: { method?: string; body?: unknown } = {}): Promise<Body> =>
  (await handler(new Request(`${origin}/api/pulse`, {
    method: opts.method ?? "GET", headers: { "content-type": "application/json", origin, "x-test-user": as },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  }), { params: Promise.resolve(params) })).json();

const sessions = new Map<string, unknown>();
async function makeUser(email: string, access: "Member" | "Admin" = "Member") {
  const user = await User.create({ email, name: email.split("@")[0], access, roles: [{ position: "OC" }] });
  sessions.set(email, { user: { id: user.id, email, access }, session: { authProvider: "microsoft" } });
  return { id: user.id as string, email };
}

const ADMIN = "admin@iitg.ac.in";
const A = "host.a@iitg.ac.in";
const B = "host.b@iitg.ac.in";

/** The administrator creates the quiz and assigns A (owner) and B (co-host); both then sign in and are linked. */
async function bootstrap() {
  await Promise.all([makeUser(ADMIN, "Admin"), makeUser(A), makeUser(B)]);
  const created = await call(createQuiz, ADMIN, {}, { method: "POST", body: { title: "DoD quiz", ownerEmail: A } });
  expect(created.ok).toBe(true);
  const quizId = created.data.id as string;
  expect((await call(addCoHost, ADMIN, { quizId }, { method: "POST", body: { email: B } })).ok).toBe(true);
  // First sign-in links each assignment to its user.
  for (const who of [A, B]) expect((await call(getDeck, who, { quizId })).ok).toBe(true);
  return quizId;
}

const slides = (): PulseSlide[] => [
  { slideId: "s-info", order: 0, type: "info", content: { markdown: "# Welcome" } },
  { slideId: "s-mcq", order: 1, type: "mcq", content: { text: "2 + 2?", options: ["3", "4", "5"], correctOptions: [1], multipleAnswers: false, poll: false, points: 50, timerSeconds: 30 } },
  { slideId: "s-poll", order: 2, type: "mcq", content: { text: "Favourite?", options: ["A", "B"], correctOptions: [], multipleAnswers: false, poll: true, points: 100, timerSeconds: null } },
];
const config = () => {
  const base = defaultPulseConfig();
  return {
    ...base,
    registration: { ...base.registration, maxParticipants: 120, allowLateJoin: true },
    settings: { ...base.settings, timer: { ...base.settings.timer, overallDurationSeconds: 1800 }, leaderboard: { ...base.settings.leaderboard, showAfterQuestions: ["s-mcq"] } },
  };
};
const lock = async (quizId: string, as: string) => (await call(acquire, as, { quizId }, { method: "POST" })).data;
const save = (quizId: string, as: string, lockToken: string, deckVersion: number, over: Record<string, unknown> = {}) =>
  call(putDeck, as, { quizId }, { method: "PUT", body: { deckVersion, lockToken, slides: slides(), ...config(), ...over } });
const savedAudits = (quizId: string) => PulseAuditEvent.countDocuments({ quizId, type: "deck.saved" });

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

describe("Pulse 2.1 definition of done", () => {
  it("links the owner and co-host created by the administrator", async () => {
    const quizId = await bootstrap();
    const stored = (await PulseQuiz.findById(quizId).lean())!;
    expect(stored.ownerId?.toString()).toBe(sessions.get(A) && (sessions.get(A) as any).user.id);
    expect(stored.hostAssignments.map((host) => [host.email, host.role, Boolean(host.userId)])).toEqual([[A, "owner", true], [B, "cohost", true]]);
    expect(stored.coHostIds).toHaveLength(1);
  });

  it("lets the lock holder save Info, MCQ and settings, and reload them identically", async () => {
    const quizId = await bootstrap();
    const { lockToken } = await lock(quizId, A);
    const saved = await save(quizId, A, lockToken, 0);
    expect(saved).toMatchObject({ ok: true, data: { deckVersion: 1 } });

    const reloaded = await call(getDeck, A, { quizId });
    expect(reloaded.data).toEqual(saved.data);
    expect(reloaded.data.slides).toEqual(slides());
    expect(reloaded.data).toMatchObject({
      editable: true, registration: { maxParticipants: 120, allowLateJoin: true, allowGuests: false },
      settings: { timer: { overallDurationSeconds: 1800 }, leaderboard: { showAfterQuestions: ["s-mcq"] } },
    });
    // The co-host sees the same saved deck.
    expect((await call(getDeck, B, { quizId })).data).toEqual(saved.data);
  });

  it("lets exactly one of two concurrent acquires win", async () => {
    const quizId = await bootstrap();
    const results = await Promise.all([A, B].map((who) => call(acquire, who, { quizId }, { method: "POST" })));
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.filter((result) => result.data.acquired)).toHaveLength(1);
    const loser = results.find((result) => !result.data.acquired)!;
    expect(loser.data.lockToken).toBeUndefined();
  });

  it("rejects the second host's acquire and save while the first holds the lock", async () => {
    const quizId = await bootstrap();
    const { lockToken } = await lock(quizId, A);
    expect((await call(acquire, B, { quizId }, { method: "POST" })).data).toMatchObject({ acquired: false, holder: { name: "host.a" } });
    // B has no token of their own, and A's token is useless in B's hands.
    expect((await save(quizId, B, "a".repeat(32), 0)).error?.code).toBe("CONFLICT");
    expect((await save(quizId, B, lockToken, 0)).error?.code).toBe("CONFLICT");
    expect((await PulseQuiz.findById(quizId).lean())!.slides).toHaveLength(0);
    expect(await savedAudits(quizId)).toBe(0);
  });

  it("rejects an invalid deck with VALIDATION_ERROR and leaves the saved deck unchanged", async () => {
    const quizId = await bootstrap();
    const { lockToken } = await lock(quizId, A);
    expect((await save(quizId, A, lockToken, 0)).ok).toBe(true);
    const broken = slides();
    broken[1] = { ...broken[1], content: { ...(broken[1].content as object), options: ["3", ""], correctOptions: [9] } } as PulseSlide;
    const rejected = await save(quizId, A, lockToken, 1, { slides: broken });
    expect(rejected.error?.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(rejected.error!.fields!)).toEqual(expect.arrayContaining(["slides.1.content.options.1", "slides.1.content.correctOptions.0"]));
    const stored = (await PulseQuiz.findById(quizId).lean())!;
    expect(stored.deckVersion).toBe(1);
    expect((await call(getDeck, A, { quizId })).data.slides).toEqual(slides());
    expect(await savedAudits(quizId)).toBe(1);
  });

  it("never reports success when the deck write or its audit fails, and changes nothing", async () => {
    const quizId = await bootstrap();
    const { lockToken } = await lock(quizId, A);

    vi.spyOn(PulseQuiz, "findOneAndUpdate").mockReturnValueOnce({ lean: () => Promise.reject(new Error("write failed")) } as never);
    expect(await save(quizId, A, lockToken, 0)).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });

    vi.spyOn(PulseAuditEvent, "create").mockRejectedValueOnce(new Error("audit failed") as never);
    expect(await save(quizId, A, lockToken, 0)).toMatchObject({ ok: false, error: { code: "SERVICE_UNAVAILABLE" } });

    const stored = (await PulseQuiz.findById(quizId).lean())!;
    expect(stored.slides).toHaveLength(0);
    expect(stored.deckVersion ?? 0).toBe(0);
    expect(await savedAudits(quizId)).toBe(0);
    // Once the failures clear the same draft saves normally.
    expect((await save(quizId, A, lockToken, 0)).ok).toBe(true);
    expect(await savedAudits(quizId)).toBe(1);
  });

  it("fences out a stale holder: after expiry and takeover only the new holder's save lands", async () => {
    const quizId = await bootstrap();
    const first = await lock(quizId, A);
    await PulseQuiz.updateOne({ _id: quizId }, { $set: { "editorLock.expiresAt": new Date(Date.now() - 1000) } });
    const second = await lock(quizId, B);
    expect(second.acquired).toBe(true);

    const bSlides = slides().slice(0, 2);
    expect((await save(quizId, B, second.lockToken, 0, { slides: bSlides, settings: { ...config().settings, leaderboard: { ...config().settings.leaderboard, showAfterQuestions: [] } } })).ok).toBe(true);
    // A comes back with the old token (and a stale view of the deck).
    expect(await save(quizId, A, first.lockToken, 0)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    const stored = (await PulseQuiz.findById(quizId).lean())!;
    expect(stored.slides.map((slide) => slide.slideId)).toEqual(["s-info", "s-mcq"]);
    expect(stored.deckVersion).toBe(1);
    expect(stored.editorLock?.lockedBy?.toString()).toBe((sessions.get(B) as any).user.id);
    expect(await savedAudits(quizId)).toBe(1);
  });

  it("writes exactly one deck.saved audit per successful save and none for failures", async () => {
    const quizId = await bootstrap();
    const { lockToken } = await lock(quizId, A);
    expect((await save(quizId, A, lockToken, 0)).ok).toBe(true);
    expect((await save(quizId, A, lockToken, 0)).ok).toBe(false); // stale version
    expect((await save(quizId, A, lockToken, 1, { slides: [] })).ok).toBe(false); // invalid
    expect((await save(quizId, A, lockToken, 1, { slides: slides().slice(0, 1), settings: { ...config().settings, leaderboard: { ...config().settings.leaderboard, showAfterQuestions: [] } } })).ok).toBe(true);
    expect(await savedAudits(quizId)).toBe(2);
    const events = await PulseAuditEvent.find({ quizId, type: "deck.saved" }).sort({ createdAt: 1 }).lean();
    expect(events.map((event) => event.metadata)).toEqual([{ deckVersion: 1, slideCount: 3 }, { deckVersion: 2, slideCount: 1 }]);
    expect(events.every((event) => event.actor.role === "owner")).toBe(true);
  });
});
