import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as create } from "@/app/api/admin/pulse/route";
import { GET as getDeck } from "@/app/api/pulse/host/[quizId]/deck/route";
import { defaultPulseConfig } from "@/lib/pulse/deckSchemas";
import PulseAuditEvent from "@/models/PulseAuditEvent";
import PulseQuiz from "@/models/PulseQuiz";
import User from "@/models/User";

import { clearTestMongo, startTestMongo, stopTestMongo } from "../utils/mongodb";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));

const origin = "http://127.0.0.1:3000";
const request = (method: string, body?: unknown) =>
  new Request(`${origin}/api/admin/pulse`, {
    method, headers: { "content-type": "application/json", origin },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const json = async (response: Response) => (await response.json()) as { ok: boolean; data?: any; error?: { code: string; fields?: Record<string, string[]> } };
function signIn(user: { id: string; email: string; access: string }) {
  getSession.mockResolvedValue({ user: { id: user.id, email: user.email, access: user.access }, session: { authProvider: "microsoft" } });
}

beforeAll(async () => {
  await startTestMongo();
  await Promise.all([User.init(), PulseQuiz.init(), PulseAuditEvent.init()]);
});
afterEach(async () => { getSession.mockReset(); await clearTestMongo(); });
afterAll(stopTestMongo);

async function seed() {
  const admin = await User.create({ email: "admin@iitg.ac.in", name: "Admin", access: "Admin", roles: [{ position: "OC" }] });
  const config = defaultPulseConfig();
  const source = await PulseQuiz.create({
    title: "Past quiz", status: "completed", roomCode: "PAST22", ownerId: admin.id,
    hostAssignments: [{ email: admin.email, role: "owner", userId: admin.id, assignedBy: admin.id }],
    delivery: { ...config.delivery, mode: "participant-paced", navigation: "free" },
    registration: { ...config.registration, maxParticipants: 42, allowLateJoin: true },
    settings: {
      ...config.settings,
      timer: { ...config.settings.timer, overallDurationSeconds: 900, perQuestionEnabled: false },
      reveal: { ...config.settings.reveal, showCorrectAnswer: true },
      leaderboard: { ...config.settings.leaderboard, showAfterQuestions: ["s2"] },
    },
    slides: [
      { slideId: "s1", order: 0, type: "info", content: { markdown: "# Old" } },
      { slideId: "s2", order: 1, type: "mcq", content: { text: "Q?", options: ["a", "b"], correctOptions: [0], multipleAnswers: false, poll: false, points: 100 } },
    ],
  });
  signIn({ id: admin.id, email: admin.email!, access: "Admin" });
  return { admin, source };
}

describe("creating a quiz from a past quiz's configuration", () => {
  it("copies delivery, registration and settings but not slides, and the host sees them in the editor", async () => {
    const { admin, source } = await seed();
    const result = await json(await create(request("POST", { title: "New quiz", ownerEmail: "host@iitg.ac.in", copyConfigFrom: source.id })));
    expect(result.ok).toBe(true);
    const created = (await PulseQuiz.findById(result.data.id).lean())!;
    expect(created).toMatchObject({
      status: "draft", title: "New quiz",
      delivery: { mode: "participant-paced", navigation: "free" },
      registration: { maxParticipants: 42, allowLateJoin: true },
      settings: { timer: { overallDurationSeconds: 900, perQuestionEnabled: false }, reveal: { showCorrectAnswer: true }, leaderboard: { showAfterQuestions: [] } },
    });
    expect(created.slides).toHaveLength(0);
    expect(created.roomCode).not.toBe(source.roomCode);
    expect(created.hostAssignments.map((host) => host.email)).toEqual(["host@iitg.ac.in"]);
    // The source is untouched.
    expect((await PulseQuiz.findById(source.id).lean())!.slides).toHaveLength(2);

    const events = await PulseAuditEvent.find({ quizId: result.data.id }).lean();
    expect(events.map((event) => event.type).sort()).toEqual(["host.assigned", "quiz.created"]);
    expect(events.find((event) => event.type === "quiz.created")?.metadata).toMatchObject({ copiedFrom: source.id });
    expect(events.every((event) => event.actor.userId.toString() === admin.id)).toBe(true);

    // The assigned host opens the deck: copied settings, no slides.
    const host = await User.create({ email: "host@iitg.ac.in", name: "Host", access: "Member", roles: [{ position: "OC" }] });
    signIn({ id: host.id, email: host.email!, access: "Member" });
    const deck = await json(await getDeck(new Request(`${origin}/api/pulse/host/x/deck`), { params: Promise.resolve({ quizId: result.data.id }) }));
    expect(deck.data).toMatchObject({
      editable: true, deckVersion: 0, slides: [],
      delivery: { mode: "participant-paced", navigation: "free" },
      registration: { maxParticipants: 42 },
      settings: { timer: { overallDurationSeconds: 900 } },
    });
  });

  it("creates a default quiz when nothing is selected", async () => {
    await seed();
    const result = await json(await create(request("POST", { title: "Plain", ownerEmail: "host@iitg.ac.in" })));
    expect(result.ok).toBe(true);
    const created = (await PulseQuiz.findById(result.data.id).lean())!;
    expect(created.registration?.maxParticipants).toBe(500);
    expect(created.delivery?.mode).toBe("host-paced");
    const events = await PulseAuditEvent.find({ quizId: result.data.id, type: "quiz.created" }).lean();
    expect(events[0].metadata).toEqual({});
  });

  it("rejects an unknown or malformed source without creating anything", async () => {
    await seed();
    const before = await PulseQuiz.countDocuments();
    const missing = await json(await create(request("POST", { title: "X", ownerEmail: "host@iitg.ac.in", copyConfigFrom: new mongoose.Types.ObjectId().toString() })));
    expect(missing).toMatchObject({ ok: false, error: { code: "PULSE_QUIZ_NOT_FOUND" } });
    const malformed = await json(await create(request("POST", { title: "X", ownerEmail: "host@iitg.ac.in", copyConfigFrom: "nope" })));
    expect(malformed).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await PulseQuiz.countDocuments()).toBe(before);
    expect(await PulseAuditEvent.countDocuments({ type: "quiz.created" })).toBe(0);
  });

  it("validates the copied configuration with the same rules", async () => {
    const { admin } = await seed();
    const bad = await mongoose.connection.collection("pulse_quizzes").insertOne({
      title: "Invalid", status: "completed", roomCode: "BAD222", ownerId: new mongoose.Types.ObjectId(admin.id), coHostIds: [], hostAssignments: [],
      delivery: { mode: "host-paced", navigation: "free", displayMode: "full-prompt" },
      registration: { allowGuests: true }, slides: [], createdAt: new Date(), updatedAt: new Date(),
    });
    const before = await PulseQuiz.countDocuments();
    const result = await json(await create(request("POST", { title: "X", ownerEmail: "host@iitg.ac.in", copyConfigFrom: bad.insertedId.toString() })));
    expect(result.error?.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(result.error!.fields!).sort()).toEqual(["delivery.navigation", "registration.allowGuests"]);
    expect(await PulseQuiz.countDocuments()).toBe(before);
  });

  it("only administrators can create quizzes", async () => {
    const member = await User.create({ email: "m@iitg.ac.in", name: "M", access: "Member", roles: [{ position: "OC" }] });
    signIn({ id: member.id, email: member.email!, access: "Member" });
    const result = await json(await create(request("POST", { title: "X", ownerEmail: "host@iitg.ac.in" })));
    expect(result).toMatchObject({ ok: false, error: { code: "PULSE_NOT_AUTHORIZED" } });
  });
});
