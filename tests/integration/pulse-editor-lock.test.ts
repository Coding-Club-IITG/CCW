import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DELETE as release, POST as acquire } from "@/app/api/pulse/host/[quizId]/lock/route";
import { PULSE_EDITOR_LOCK_TTL_MS, type PulseQuizStatus } from "@/lib/pulse/constants";
import PulseQuiz from "@/models/PulseQuiz";
import User from "@/models/User";

import { clearTestMongo, startTestMongo, stopTestMongo } from "../utils/mongodb";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
// The test already holds an isolated connection; the app's own dbConnect would open another.
vi.mock("@/lib/mongodb", () => ({ dbConnect: async () => undefined, default: async () => undefined }));

const origin = "http://127.0.0.1:3000";
const context = (quizId: string) => ({ params: Promise.resolve({ quizId }) });
type Handler = (request: Request, context: { params: Promise<{ quizId: string }> }) => Promise<Response>;
const call = (handler: Handler, quizId: string, as: string, body?: unknown, method = "POST") =>
  handler(new Request(`${origin}/api/pulse/host/${quizId}/lock`, {
    method, headers: { "content-type": "application/json", origin, "x-test-user": as },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), context(quizId));

type Member = { id: string; email: string; name: string };
const sessions = new Map<string, unknown>();
async function makeUser(email: string, name: string, access: "Member" | "Admin" = "Member") {
  const member = await User.create({ email, name, access, roles: [{ position: "OC" }] });
  sessions.set(email, { user: { id: member.id, email, access }, session: { authProvider: "microsoft" } });
  return { id: member.id as string, email, name };
}
async function makeQuiz(owner: Member, cohost?: Member, status: PulseQuizStatus = "draft") {
  return PulseQuiz.create({
    status, roomCode: Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[01OIL]/g, "A").padEnd(6, "A"),
    ownerId: owner.id, coHostIds: cohost ? [cohost.id] : [],
    hostAssignments: [
      { email: owner.email, role: "owner", userId: owner.id, assignedBy: owner.id },
      ...(cohost ? [{ email: cohost.email, role: "cohost", userId: cohost.id, assignedBy: owner.id }] : []),
    ],
  });
}
async function json(response: Response) {
  return (await response.json()) as { ok: boolean; data?: any; error?: { code: string; message: string } };
}

beforeAll(async () => {
  getSession.mockImplementation(async ({ headers }: { headers: Headers }) => sessions.get(headers.get("x-test-user") ?? "") ?? null);
  await startTestMongo();
  await Promise.all([User.init(), PulseQuiz.init()]);
});
afterEach(async () => {
  sessions.clear();
  await clearTestMongo();
});
afterAll(stopTestMongo);

const expire = (id: string) => PulseQuiz.updateOne({ _id: id }, { $set: { "editorLock.expiresAt": new Date(Date.now() - 1000) } });

describe("Pulse editor lock (MongoDB, TTL)", () => {
  it("lets exactly one of two concurrent acquires win and never leaks the winner's token", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const id = (await makeQuiz(a, b)).id;
    const bodies = await Promise.all((await Promise.all([call(acquire, id, a.email), call(acquire, id, b.email)])).map(json));
    const winners = bodies.filter((body) => body.data?.acquired);
    const losers = bodies.filter((body) => body.ok && !body.data?.acquired);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const token = winners[0].data.lockToken as string;
    expect(JSON.stringify(losers[0])).not.toContain(token);
    expect(losers[0].data.lockToken).toBeUndefined();
    expect(losers[0].data.holder).toEqual({ name: ["Alice", "Bob"][bodies.findIndex((body) => body.data?.acquired)] });
    expect(JSON.stringify(losers[0])).not.toContain("@iitg.ac.in");
    const stored = (await PulseQuiz.findById(id).lean())!.editorLock!;
    expect(stored.token).toBe(token);
    expect(stored.lockedBy).toBeTruthy();
    const ttl = stored.expiresAt!.getTime() - stored.lockedAt!.getTime();
    expect(ttl).toBe(PULSE_EDITOR_LOCK_TTL_MS);
  });

  it("claims with several contenders at once and leaves a single holder", async () => {
    const people = await Promise.all(["a", "b", "c", "d"].map((n) => makeUser(`${n}@iitg.ac.in`, n.toUpperCase())));
    const id = (await makeQuiz(people[0], people[1])).id;
    await PulseQuiz.updateOne({ _id: id }, { $set: { coHostIds: people.slice(1).map((p) => p.id) } });
    const raced = await Promise.all(people.map((who) => call(acquire, id, who.email).then(json)));
    expect(raced.filter((r) => r.data?.acquired)).toHaveLength(1);
  });

  it("blocks the other host and replaces the token when the same host re-acquires", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const id = (await makeQuiz(a, b)).id;
    const first = (await json(await call(acquire, id, a.email))).data;
    const again = (await json(await call(acquire, id, a.email))).data;
    expect(again.acquired).toBe(true);
    expect(again.lockToken).not.toBe(first.lockToken);
    // The first token no longer releases anything.
    expect((await json(await call(release, id, a.email, { lockToken: first.lockToken }, "DELETE"))).data).toEqual({ released: false });
    expect((await json(await call(acquire, id, b.email))).data).toMatchObject({ acquired: false, holder: { name: "Alice" } });
  });

  it("takes over an expired lock; the old token can neither release nor override it", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const id = (await makeQuiz(a, b)).id;
    const stale = (await json(await call(acquire, id, a.email))).data.lockToken as string;
    await expire(id);
    const taken = (await json(await call(acquire, id, b.email))).data;
    expect(taken.acquired).toBe(true);
    expect((await json(await call(release, id, a.email, { lockToken: stale }, "DELETE"))).data).toEqual({ released: false });
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.lockedBy!.toString()).toBe(b.id);
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.token).toBe(taken.lockToken);
  });

  it("releases only with the matching token, then lets another host acquire", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const id = (await makeQuiz(a, b)).id;
    const { lockToken } = (await json(await call(acquire, id, a.email))).data;
    expect((await json(await call(release, id, b.email, { lockToken }, "DELETE"))).data).toEqual({ released: false });
    expect((await json(await call(release, id, a.email, { lockToken }, "DELETE"))).data).toEqual({ released: true });
    expect((await PulseQuiz.findById(id).lean())!.editorLock).toMatchObject({ lockedBy: null, expiresAt: null, token: null });
    expect((await json(await call(acquire, id, b.email))).data.acquired).toBe(true);
  });

  it("does not extend the lock on its own: the expiry stays where acquire set it", async () => {
    const a = await makeUser("a@iitg.ac.in", "Alice");
    const id = (await makeQuiz(a)).id;
    await call(acquire, id, a.email);
    const before = (await PulseQuiz.findById(id).lean())!.editorLock!.expiresAt!.getTime();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.expiresAt!.getTime()).toBe(before);
  });

  it("rejects non-hosts and admins who are not assigned", async () => {
    const [a, outsider, admin] = [
      await makeUser("a@iitg.ac.in", "Alice"), await makeUser("x@iitg.ac.in", "Eve"), await makeUser("admin@iitg.ac.in", "Admin", "Admin"),
    ];
    const id = (await makeQuiz(a)).id;
    for (const who of [outsider.email, admin.email]) {
      expect(await json(await call(acquire, id, who))).toMatchObject({ ok: false, error: { code: "PULSE_NOT_HOST" } });
    }
    expect(await json(await call(acquire, id, "nobody@iitg.ac.in"))).toMatchObject({ ok: false, error: { code: "PULSE_NOT_AUTHORIZED" } });
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.lockedBy).toBeNull();
  });

  it("rejects acquire unless the quiz is draft or scheduled", async () => {
    const a = await makeUser("a@iitg.ac.in", "Alice");
    for (const status of ["lobby_open", "live", "paused", "completed", "cancelled", "archived"] as const) {
      const quiz = await makeQuiz(a, undefined, status);
      expect((await json(await call(acquire, quiz.id, a.email))).error?.code).toBe("CONFLICT");
      expect((await PulseQuiz.findById(quiz.id).lean())!.editorLock!.lockedBy).toBeNull();
    }
    expect((await json(await call(acquire, (await makeQuiz(a, undefined, "scheduled")).id, a.email))).data.acquired).toBe(true);
  });

  it("refuses a claim at the write if the lobby opened after the check", async () => {
    const a = await makeUser("a@iitg.ac.in", "Alice");
    const id = (await makeQuiz(a)).id;
    const original = PulseQuiz.findOneAndUpdate.bind(PulseQuiz);
    vi.spyOn(PulseQuiz, "findOneAndUpdate").mockImplementationOnce(((...args: Parameters<typeof original>) => ({
      lean: async () => {
        await PulseQuiz.updateOne({ _id: id }, { $set: { status: "lobby_open" } });
        return original(...args).lean();
      },
    })) as never);
    const result = await json(await call(acquire, id, a.email));
    expect(result.data).toMatchObject({ acquired: false });
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.lockedBy).toBeNull();
  });

  it("validates the release body strictly", async () => {
    const a = await makeUser("a@iitg.ac.in", "Alice");
    const id = (await makeQuiz(a)).id;
    for (const body of [{}, { lockToken: "short" }, { lockToken: "a".repeat(32), extra: 1 }]) {
      expect((await json(await call(release, id, a.email, body, "DELETE"))).error?.code).toBe("VALIDATION_ERROR");
    }
  });
});
