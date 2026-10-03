import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { GET as adminList, POST as create } from "@/app/api/admin/pulse/route";
import { GET as adminDetail } from "@/app/api/admin/pulse/[quizId]/route";
import { POST as adminAdd, DELETE as adminRemove } from "@/app/api/admin/pulse/[quizId]/cohosts/route";
import { GET as hostList } from "@/app/api/pulse/host/route";
import { GET as hostDetail } from "@/app/api/pulse/host/[quizId]/route";
import { POST as hostAdd, DELETE as hostRemove } from "@/app/api/pulse/host/[quizId]/cohosts/route";
import PulseQuiz from "@/models/PulseQuiz";
import PulseAuditEvent from "@/models/PulseAuditEvent";
import User from "@/models/User";
import type { PulseQuizDetailDto } from "@/lib/pulse/quizzes";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../utils/mongodb";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
const origin = "http://127.0.0.1:3000";
function request(method = "GET", body?: unknown, query = "", requestOrigin: string | null = origin) {
  return new Request(`${origin}/api/pulse${query}`, {
    method, headers: { "content-type": "application/json", ...(requestOrigin ? { origin: requestOrigin } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const context = (quizId: string) => ({ params: Promise.resolve({ quizId }) });
async function user(email: string, access: "Admin" | "Member" = "Member") {
  return User.create({ email, access, roles: [{ position: "OC" }] });
}
function signIn(member: Awaited<ReturnType<typeof user>>, authProvider = "microsoft") {
  getSession.mockResolvedValue({
    user: { id: member.id, email: member.email, access: member.access },
    session: { authProvider },
  });
}
async function data(response: Response): Promise<PulseQuizDetailDto> {
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.ok).toBe(true);
  return result.data;
}
async function created(title = " Quiz ", ownerEmail = " OWNER@IITG.ac.in ") {
  return data(await create(request("POST", { title, ownerEmail })));
}
async function error(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ ok: false, error: { code } });
}
beforeAll(async () => {
  await startTestMongo();
  await Promise.all([User.init(), PulseQuiz.init(), PulseAuditEvent.init()]);
});
afterEach(async () => { getSession.mockReset(); await clearTestMongo(); });
afterAll(stopTestMongo);

describe("Pulse management routes", () => {
  it("allows only admins to create/list/read/manage quizzes, including an assigned member", async () => {
    getSession.mockResolvedValue(null);
    await error(await create(request("POST", { title: "Quiz", ownerEmail: "owner@iitg.ac.in" })), 403, "PULSE_NOT_AUTHORIZED");
    const owner = await user("owner@iitg.ac.in");
    signIn(await user("admin@iitg.ac.in", "Admin"));
    const quiz = await created();
    signIn(owner);
    const ctx = context(quiz.id);
    for (const response of [
      await adminList(request()), await create(request("POST", { title: "Another", ownerEmail: owner.email })),
      await adminDetail(request(), ctx), await adminAdd(request("POST", { email: "cohost@iitg.ac.in" }), ctx),
      await adminRemove(request("DELETE", { email: "owner@iitg.ac.in" }), ctx),
    ]) await error(response, 403, "PULSE_NOT_AUTHORIZED");
    expect(await PulseQuiz.countDocuments()).toBe(1);
  });

  it("creates unique Draft codes and a normalized pending owner without provisioning CCW membership", async () => {
    const admin = await user("admin@iitg.ac.in", "Admin");
    signIn(admin);
    const first = await created();
    const second = await created("Second", "another@iitg.ac.in");
    expect(first).toMatchObject({ title: "Quiz", status: "draft", owner: { email: "owner@iitg.ac.in", userId: null }, coHosts: [] });
    expect(first.roomCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(second.roomCode).not.toBe(first.roomCode);
    expect(await User.countDocuments()).toBe(1);
    const events = await PulseAuditEvent.find({ quizId: first.id }).lean();
    expect(events.map((event) => event.type).sort()).toEqual(["host.assigned", "quiz.created"]);
    expect(events.every((event) => event.actor.userId.toString() === admin.id)).toBe(true);
    expect((await PulseQuiz.findById(first.id))?.registration?.allowGuests).toBe(false);
  });

  it("validates strict payloads, Microsoft email domains, JSON and request origins", async () => {
    signIn(await user("admin@iitg.ac.in", "Admin"));
    for (const body of [
      { title: "", ownerEmail: "owner@iitg.ac.in" },
      { title: "Quiz", ownerEmail: "owner@gmail.com" },
      { title: "Quiz", ownerEmail: "invalid" },
      { title: "Quiz", ownerEmail: "owner@iitg.ac.in", ownerId: new mongoose.Types.ObjectId().toString() },
    ]) await error(await create(request("POST", body)), 400, "VALIDATION_ERROR");
    const body = { title: "Quiz", ownerEmail: "owner@iitg.ac.in" };
    for (const origin of [null, "https://attacker.example"])
      await error(await create(request("POST", body, "", origin)), 403, "PULSE_NOT_AUTHORIZED");
    const invalidJson = new Request(`${origin}/api/admin/pulse`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{" });
    await error(await create(invalidJson), 400, "VALIDATION_ERROR");
    expect(await PulseQuiz.countDocuments()).toBe(0);
    expect(await PulseAuditEvent.countDocuments()).toBe(0);
  });

  it("paginates and filters admin lists, rejects invalid queries, and excludes database-only fields", async () => {
    signIn(await user("admin@iitg.ac.in", "Admin"));
    const quiz = await created();
    const second = await created("Second", "second@iitg.ac.in");
    await PulseQuiz.updateOne({ _id: second.id }, { $set: { status: "scheduled" } });
    await PulseQuiz.updateOne({ _id: quiz.id }, { $push: { slides: { slideId: "s1", order: 0, type: "mcq", content: { answerKey: "PRIVATE_ANSWER" } } } });
    const page = await (await adminList(request("GET", undefined, "?page=2&limit=1"))).json();
    expect(page.data.items).toHaveLength(1);
    expect(page.data.pagination).toMatchObject({ page: 2, total: 2, totalPages: 2 });
    const filtered = await (await adminList(request("GET", undefined, "?status=scheduled"))).json();
    expect(filtered.data.items.map((item: { id: string }) => item.id)).toEqual([second.id]);
    for (const query of ["?status=unknown", "?page=invalid", "?limit=invalid", "?status=draft&status=live", "?ownerId=other"])
      await error(await adminList(request("GET", undefined, query)), 400, "VALIDATION_ERROR");
    const detail = await data(await adminDetail(request(), context(quiz.id)));
    expect(Object.keys(detail).sort()).toEqual(["accessRole", "coHosts", "createdAt", "id", "owner", "roomCode", "status", "title"]);
    expect(JSON.stringify(detail)).not.toContain("PRIVATE_ANSWER");
    await error(await adminDetail(request(), context(new mongoose.Types.ObjectId().toString())), 404, "PULSE_QUIZ_NOT_FOUND");
    await error(await adminDetail(request(), context("invalid")), 400, "VALIDATION_ERROR");
  });

  it("lazily links and lists only the authenticated user's quiz IDs, denying unassigned and non-Microsoft access", async () => {
    const owner = await user("owner@iitg.ac.in");
    const outsider = await user("outsider@iitg.ac.in");
    signIn(await user("admin@iitg.ac.in", "Admin"));
    const mine = await created();
    await created("Other", "other@iitg.ac.in");
    signIn(owner);
    const result = await (await hostList(request())).json();
    expect(result.data.items).toMatchObject([{ id: mine.id, role: "owner" }]);
    expect(result.data.items).toHaveLength(1);
    expect((await data(await hostDetail(request(), context(mine.id)))).accessRole).toBe("owner");
    signIn(owner, "google");
    await error(await hostDetail(request(), context(mine.id)), 403, "PULSE_NOT_HOST");
    await error(await hostList(request()), 403, "PULSE_NOT_HOST");
    signIn(outsider);
    expect((await (await hostList(request())).json()).data.items).toEqual([]);
    await error(await hostDetail(request(), context(mine.id)), 403, "PULSE_NOT_HOST");
    getSession.mockResolvedValue(null);
    await error(await hostList(request()), 403, "PULSE_NOT_AUTHORIZED");
  });

  it("lets owners add/remove and co-hosts add only, removes linked privileges, and audits successful changes", async () => {
    const owner = await user("owner@iitg.ac.in");
    const cohost = await user("cohost@iitg.ac.in");
    signIn(await user("admin@iitg.ac.in", "Admin"));
    const quiz = await created();
    const ctx = context(quiz.id);
    signIn(owner);
    const added = await data(await hostAdd(request("POST", { email: " COHOST@IITG.ac.in " }), ctx));
    expect(added.coHosts).toEqual([{ email: "cohost@iitg.ac.in", userId: null, linkedAt: null }]);
    signIn(cohost);
    expect((await data(await hostDetail(request(), ctx))).accessRole).toBe("cohost");
    const list = await (await hostList(request())).json();
    expect(list.data.items).toMatchObject([{ id: quiz.id, role: "cohost" }]);
    await data(await hostAdd(request("POST", { email: "pending@iitg.ac.in" }), ctx));
    const auditsBefore = await PulseAuditEvent.countDocuments();
    await error(await hostRemove(request("DELETE", { email: "pending@iitg.ac.in" }), ctx), 403, "PULSE_NOT_AUTHORIZED");
    expect(await PulseAuditEvent.countDocuments()).toBe(auditsBefore);
    signIn(owner);
    await data(await hostRemove(request("DELETE", { email: cohost.email }), ctx));
    const found = await PulseQuiz.findById(quiz.id).lean();
    expect(found?.ownerId?.toString()).toBe(owner.id);
    expect(found?.coHostIds.map(String)).toEqual([]);
    expect(found?.hostAssignments.map((host) => host.email)).toEqual(["owner@iitg.ac.in", "pending@iitg.ac.in"]);
    expect(await PulseAuditEvent.countDocuments({ quizId: quiz.id, type: "host.removed" })).toBe(1);
    signIn(cohost);
    await error(await hostDetail(request(), ctx), 403, "PULSE_NOT_HOST");
    expect((await (await hostList(request())).json()).data.items).toEqual([]);
    expect((await User.findById(cohost.id))?.access).toBe("Member");
  });

  it("rejects owner removal/addition, duplicate co-hosts including concurrent requests, and owner transfer fields", async () => {
    signIn(await user("admin@iitg.ac.in", "Admin"));
    const quiz = await created();
    const ctx = context(quiz.id);
    for (const handler of [adminAdd, adminRemove])
      await error(await handler(request(handler === adminAdd ? "POST" : "DELETE", { email: "owner@iitg.ac.in" }), ctx), 409, "CONFLICT");
    await error(await adminAdd(request("POST", { email: "cohost@iitg.ac.in", ownerEmail: "replacement@iitg.ac.in" }), ctx), 400, "VALIDATION_ERROR");
    const responses = await Promise.all([
      adminAdd(request("POST", { email: "cohost@iitg.ac.in" }), ctx),
      adminAdd(request("POST", { email: " COHOST@IITG.ac.in " }), ctx),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    await error(await adminAdd(request("POST", { email: "cohost@iitg.ac.in" }), ctx), 409, "CONFLICT");
    await error(await adminRemove(request("DELETE", { email: "missing@iitg.ac.in" }), ctx), 404, "NOT_FOUND");
    expect(await PulseAuditEvent.countDocuments({ quizId: quiz.id, type: "host.assigned" })).toBe(2);
    expect((await PulseQuiz.findById(quiz.id))?.hostAssignments[0].email).toBe("owner@iitg.ac.in");
  });

  it("allows admins to remove pending co-hosts even when also assigned as a co-host", async () => {
    const admin = await user("admin@iitg.ac.in", "Admin");
    signIn(admin);
    const quiz = await created();
    const ctx = context(quiz.id);
    await data(await adminAdd(request("POST", { email: admin.email }), ctx));
    await data(await adminAdd(request("POST", { email: "pending@iitg.ac.in" }), ctx));
    const removed = await data(await hostRemove(request("DELETE", { email: "pending@iitg.ac.in" }), ctx));
    expect(removed.accessRole).toBe("admin");
    expect(removed.coHosts.map((host) => host.email)).toEqual([admin.email]);
  });

  it("protects owners on legacy quizzes without email assignments", async () => {
    const owner = await user("owner@iitg.ac.in");
    const quiz = await PulseQuiz.create({ ownerId: owner._id, roomCode: "A7K9P2" });
    signIn(await user("admin@iitg.ac.in", "Admin"));
    for (const [handler, method] of [[adminAdd, "POST"], [adminRemove, "DELETE"]] as const)
      await error(await handler(request(method, { email: owner.email }), context(quiz.id)), 409, "CONFLICT");
    expect((await PulseQuiz.findById(quiz.id))?.ownerId?.toString()).toBe(owner.id);
    expect(await PulseAuditEvent.countDocuments()).toBe(0);
  });

  it("rejects a second host assignment for the same user after an email change", async () => {
    const admin = await user("admin@iitg.ac.in", "Admin");
    const owner = await user("owner@iitg.ac.in");
    const cohost = await user("cohost@iitg.ac.in");
    signIn(admin);
    const quiz = await created();
    const ctx = context(quiz.id);
    await data(await adminAdd(request("POST", { email: cohost.email }), ctx));
    signIn(owner);
    await data(await hostDetail(request(), ctx));
    signIn(cohost);
    await data(await hostDetail(request(), ctx));
    await User.updateOne({ _id: owner._id }, { $set: { email: "owner-alias@iitg.ac.in" } });
    await User.updateOne({ _id: cohost._id }, { $set: { email: "cohost-alias@iitg.ac.in" } });
    signIn(admin);
    for (const email of ["owner-alias@iitg.ac.in", "cohost-alias@iitg.ac.in"])
      await error(await adminAdd(request("POST", { email }), ctx), 409, "CONFLICT");
    expect((await PulseQuiz.findById(quiz.id))?.hostAssignments).toHaveLength(2);
    expect(await PulseAuditEvent.countDocuments({ quizId: quiz.id, type: "host.assigned" })).toBe(2);
  });

  it("rolls back quiz creation and co-host changes if auditing fails", async () => {
    signIn(await user("admin@iitg.ac.in", "Admin"));
    const db = mongoose.connection.db!;
    await db.command({ collMod: "pulse_audit_events", validator: { type: { $ne: "host.assigned" } } });
    try {
      await error(await create(request("POST", { title: "Fail", ownerEmail: "owner@iitg.ac.in" })), 500, "INTERNAL_ERROR");
      expect(await PulseQuiz.countDocuments()).toBe(0);
      expect(await PulseAuditEvent.countDocuments()).toBe(0);
    } finally { await db.command({ collMod: "pulse_audit_events", validator: {} }); }
    const quiz = await created();
    const ctx = context(quiz.id);
    await db.command({ collMod: "pulse_audit_events", validator: { type: { $ne: "host.assigned" } } });
    try {
      await error(await adminAdd(request("POST", { email: "cohost@iitg.ac.in" }), ctx), 500, "INTERNAL_ERROR");
      expect((await PulseQuiz.findById(quiz.id))?.hostAssignments).toHaveLength(1);
    } finally { await db.command({ collMod: "pulse_audit_events", validator: {} }); }
    await data(await adminAdd(request("POST", { email: "cohost@iitg.ac.in" }), ctx));
    await db.command({ collMod: "pulse_audit_events", validator: { type: { $ne: "host.removed" } } });
    try {
      await error(await adminRemove(request("DELETE", { email: "cohost@iitg.ac.in" }), ctx), 500, "INTERNAL_ERROR");
      expect((await PulseQuiz.findById(quiz.id))?.hostAssignments).toHaveLength(2);
      expect(await PulseAuditEvent.countDocuments({ type: "host.removed" })).toBe(0);
    } finally { await db.command({ collMod: "pulse_audit_events", validator: {} }); }
  });
});
