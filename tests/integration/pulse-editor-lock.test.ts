import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { DELETE as release, PATCH as heartbeat, POST as acquire } from "@/app/api/pulse/host/[quizId]/lock/route";
import { PULSE_EDITOR_LOCK_TTL_MS, pulseEditorLockKey, type PulseQuizStatus } from "@/lib/pulse/constants";
import PulseQuiz from "@/models/PulseQuiz";
import User from "@/models/User";

import { clearTestMongo, startTestMongo, stopTestMongo } from "../utils/mongodb";
import { connectTestRedis, deleteLockKeys, type TestRedis } from "../utils/redis";

const { getSession, redisState } = vi.hoisted(() => {
  // Isolated logical DB so the code under test never touches real dev data.
  process.env.REDIS_URL = process.env.REDIS_TEST_URL ?? "redis://127.0.0.1:6379/15";
  return { getSession: vi.fn(), redisState: { down: false } };
});
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/redis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/redis")>();
  // Simulates an unreachable Redis (a true external boundary) without touching the server.
  return { ...actual, getRedis: () => (redisState.down ? Promise.reject(new Error("ECONNREFUSED")) : actual.getRedis()) };
});

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

let redis: TestRedis | null = null;
beforeAll(async () => {
  getSession.mockImplementation(async ({ headers }: { headers: Headers }) => sessions.get(headers.get("x-test-user") ?? "") ?? null);
  await startTestMongo();
  await Promise.all([User.init(), PulseQuiz.init()]);
  redis = await connectTestRedis();
});
afterEach(async () => {
  redisState.down = false;
  await deleteLockKeys(redis, (await PulseQuiz.find().select("_id").lean()).map((quiz) => quiz._id.toString()));
  sessions.clear();
  await clearTestMongo();
});
afterAll(async () => { await redis?.quit(); await stopTestMongo(); });

const withRedis = (name: string, run: () => Promise<void>) =>
  it(name, async (ctx) => { if (!redis) ctx.skip(); await run(); });

describe("Pulse editor lock (Redis primary)", () => {
  withRedis("lets exactly one of two concurrent acquires win and never leaks the winner's token", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const quiz = await makeQuiz(a, b);
    const id = quiz.id;
    const responses = await Promise.all([call(acquire, id, a.email), call(acquire, id, b.email)]);
    const bodies = await Promise.all(responses.map(json));
    const winners = bodies.filter((body) => body.data?.acquired);
    const losers = bodies.filter((body) => body.ok && !body.data?.acquired);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    const token = winners[0].data.lockToken as string;
    expect(JSON.stringify(losers[0])).not.toContain(token);
    expect(losers[0].data.lockToken).toBeUndefined();
    const winnerName = ["Alice", "Bob"][bodies.findIndex((body) => body.data?.acquired)];
    expect(losers[0].data.holder).toEqual({ name: winnerName });
    expect(JSON.stringify(losers[0])).not.toContain("@iitg.ac.in");
    expect(await redis!.get(pulseEditorLockKey(id))).toMatch(new RegExp(`:${token}$`));
    expect(await redis!.pTTL(pulseEditorLockKey(id))).toBeGreaterThan(PULSE_EDITOR_LOCK_TTL_MS - 5_000);
    const mirror = (await PulseQuiz.findById(id).lean())!.editorLock!;
    expect(mirror.lockedBy).toBeTruthy();
    expect(mirror.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(mirror.token).toBe(token);
  });

  withRedis("blocks the other host and replaces the token when the same host re-acquires", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const id = (await makeQuiz(a, b)).id;
    const first = (await json(await call(acquire, id, a.email))).data;
    const again = (await json(await call(acquire, id, a.email))).data;
    expect(again.acquired).toBe(true);
    expect(again.lockToken).not.toBe(first.lockToken);
    expect((await json(await call(heartbeat, id, a.email, { lockToken: first.lockToken }, "PATCH"))).error?.code).toBe("PULSE_EDITOR_LOCKED");
    expect((await json(await call(heartbeat, id, a.email, { lockToken: again.lockToken }, "PATCH"))).ok).toBe(true);
    expect((await json(await call(acquire, id, b.email))).data.acquired).toBe(false);
  });

  withRedis("denies a stale token heartbeat or release after an expired takeover", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const id = (await makeQuiz(a, b)).id;
    const stale = (await json(await call(acquire, id, a.email))).data.lockToken as string;
    // Alice's tab goes quiet: the Redis key and the mirror both lapse.
    await redis!.del(pulseEditorLockKey(id));
    await PulseQuiz.updateOne({ _id: id }, { $set: { "editorLock.expiresAt": new Date(Date.now() - 1000) } });

    const taken = (await json(await call(acquire, id, b.email))).data;
    expect(taken.acquired).toBe(true);

    expect(await json(await call(heartbeat, id, a.email, { lockToken: stale }, "PATCH"))).toMatchObject({ ok: false, error: { code: "PULSE_EDITOR_LOCKED" } });
    expect((await json(await call(release, id, a.email, { lockToken: stale }, "DELETE"))).data).toEqual({ released: false });
    // Bob's lock survived both attempts.
    expect(await redis!.get(pulseEditorLockKey(id))).toBe(`${b.id}:${taken.lockToken}`);
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.lockedBy!.toString()).toBe(b.id);
    expect((await json(await call(heartbeat, id, b.email, { lockToken: taken.lockToken }, "PATCH"))).ok).toBe(true);
  });

  withRedis("extends the TTL on heartbeat and clears the lock on release", async () => {
    const a = await makeUser("a@iitg.ac.in", "Alice");
    const id = (await makeQuiz(a)).id;
    const { lockToken } = (await json(await call(acquire, id, a.email))).data;
    await redis!.pExpire(pulseEditorLockKey(id), 5_000);
    expect(await redis!.pTTL(pulseEditorLockKey(id))).toBeLessThanOrEqual(5_000);
    expect((await json(await call(heartbeat, id, a.email, { lockToken }, "PATCH"))).ok).toBe(true);
    expect(await redis!.pTTL(pulseEditorLockKey(id))).toBeGreaterThan(PULSE_EDITOR_LOCK_TTL_MS - 5_000);

    expect((await json(await call(release, id, a.email, { lockToken }, "DELETE"))).data).toEqual({ released: true });
    expect(await redis!.get(pulseEditorLockKey(id))).toBeNull();
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.lockedBy).toBeNull();
    // Heartbeat after release is rejected rather than silently recreating the lock.
    expect((await json(await call(heartbeat, id, a.email, { lockToken }, "PATCH"))).error?.code).toBe("PULSE_EDITOR_LOCKED");
  });

  withRedis("still blocks other hosts from the durable mirror when Redis lost its keys", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const id = (await makeQuiz(a, b)).id;
    await call(acquire, id, a.email);
    await redis!.del(pulseEditorLockKey(id));
    const result = (await json(await call(acquire, id, b.email))).data;
    expect(result).toMatchObject({ acquired: false, holder: { name: "Alice" } });
    expect(await redis!.get(pulseEditorLockKey(id))).toBeNull();
  });

  withRedis("rejects non-hosts and admins who are not assigned", async () => {
    const [a, outsider, admin] = [
      await makeUser("a@iitg.ac.in", "Alice"), await makeUser("x@iitg.ac.in", "Eve"), await makeUser("admin@iitg.ac.in", "Admin", "Admin"),
    ];
    const id = (await makeQuiz(a)).id;
    for (const who of [outsider.email, admin.email]) {
      expect(await json(await call(acquire, id, who))).toMatchObject({ ok: false, error: { code: "PULSE_NOT_HOST" } });
    }
    expect(await json(await call(acquire, id, "nobody@iitg.ac.in"))).toMatchObject({ ok: false, error: { code: "PULSE_NOT_AUTHORIZED" } });
    expect(await redis!.get(pulseEditorLockKey(id))).toBeNull();
  });

  withRedis("rejects acquire and heartbeat once the lobby has opened", async () => {
    const a = await makeUser("a@iitg.ac.in", "Alice");
    const id = (await makeQuiz(a)).id;
    const { lockToken } = (await json(await call(acquire, id, a.email))).data;
    await PulseQuiz.updateOne({ _id: id }, { $set: { status: "lobby_open" } });
    expect(await json(await call(acquire, id, a.email))).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await json(await call(heartbeat, id, a.email, { lockToken }, "PATCH"))).toMatchObject({ ok: false, error: { code: "CONFLICT" } });

    const second = await makeQuiz(a, undefined, "live");
    expect((await json(await call(acquire, second.id, a.email))).error?.code).toBe("CONFLICT");
    expect(await redis!.get(pulseEditorLockKey(second.id))).toBeNull();
    const scheduled = await makeQuiz(a, undefined, "scheduled");
    expect((await json(await call(acquire, scheduled.id, a.email))).data.acquired).toBe(true);
  });

  withRedis("validates the request body strictly", async () => {
    const a = await makeUser("a@iitg.ac.in", "Alice");
    const id = (await makeQuiz(a)).id;
    for (const body of [{}, { lockToken: "short" }, { lockToken: "a".repeat(32), extra: 1 }]) {
      expect((await json(await call(heartbeat, id, a.email, body, "PATCH"))).error?.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("Pulse editor lock (Redis unavailable: MongoDB fallback)", () => {
  it("acquires, blocks, heartbeats and releases through the durable mirror", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const id = (await makeQuiz(a, b)).id;
    redisState.down = true;

    const won = (await json(await call(acquire, id, a.email))).data;
    expect(won.acquired).toBe(true);
    const blocked = (await json(await call(acquire, id, b.email))).data;
    expect(blocked).toMatchObject({ acquired: false, holder: { name: "Alice" } });
    expect(blocked.lockToken).toBeUndefined();

    // Concurrent claims still produce a single winner.
    const [c] = [await makeUser("c@iitg.ac.in", "Carol")];
    const racing = await PulseQuiz.create({
      roomCode: "RACE22", ownerId: a.id, coHostIds: [b.id, c.id],
      hostAssignments: [{ email: a.email, role: "owner", userId: a.id, assignedBy: a.id }],
    });
    const raced = await Promise.all([a, b, c].map((who) => call(acquire, racing.id, who.email).then(json)));
    expect(raced.filter((r) => r.data?.acquired)).toHaveLength(1);

    expect((await json(await call(heartbeat, id, a.email, { lockToken: won.lockToken }, "PATCH"))).ok).toBe(true);
    expect((await json(await call(heartbeat, id, b.email, { lockToken: won.lockToken }, "PATCH"))).error?.code).toBe("PULSE_EDITOR_LOCKED");
    expect((await json(await call(release, id, b.email, { lockToken: won.lockToken }, "DELETE"))).data).toEqual({ released: false });
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.lockedBy!.toString()).toBe(a.id);

    expect((await json(await call(release, id, a.email, { lockToken: won.lockToken }, "DELETE"))).data).toEqual({ released: true });
    expect((await json(await call(acquire, id, b.email))).data.acquired).toBe(true);
  });

  it("takes over an expired mirror lock, and rejects after the lobby opens", async () => {
    const [a, b] = [await makeUser("a@iitg.ac.in", "Alice"), await makeUser("b@iitg.ac.in", "Bob")];
    const id = (await makeQuiz(a, b)).id;
    redisState.down = true;
    const stale = (await json(await call(acquire, id, a.email))).data.lockToken as string;
    await PulseQuiz.updateOne({ _id: id }, { $set: { "editorLock.expiresAt": new Date(Date.now() - 1000) } });

    expect((await json(await call(heartbeat, id, a.email, { lockToken: stale }, "PATCH"))).error?.code).toBe("PULSE_EDITOR_LOCKED");
    expect((await json(await call(acquire, id, b.email))).data.acquired).toBe(true);
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.lockedBy!.toString()).toBe(b.id);

    await PulseQuiz.updateOne({ _id: id }, { $set: { status: "lobby_open", "editorLock.expiresAt": new Date(Date.now() - 1000) } });
    expect((await json(await call(acquire, id, a.email))).error?.code).toBe("CONFLICT");
  });

  it("refuses a fallback claim on a quiz that is no longer editable", async () => {
    const a = await makeUser("a@iitg.ac.in", "Alice");
    const id = (await makeQuiz(a)).id;
    redisState.down = true;
    await PulseQuiz.updateOne({ _id: id }, { $set: { status: "live" } });
    expect((await json(await call(acquire, id, a.email))).error?.code).toBe("CONFLICT");
    expect((await PulseQuiz.findById(id).lean())!.editorLock!.lockedBy).toBeNull();
  });
});
