import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPulseSession, PulseError, pulseRoute, requireAdmin, requireHostOrAdmin, requirePulseHost } from "@/lib/api/pulse";
import { err, ok } from "@/lib/api/result";
import { linkHostAssignmentsForUser } from "@/lib/pulse/hostAssignments";
import PulseAuditEvent from "@/models/PulseAuditEvent";
import PulseQuiz from "@/models/PulseQuiz";
import User from "@/models/User";
import { clearTestMongo, startTestMongo, stopTestMongo } from "../utils/mongodb";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
const id = () => new mongoose.Types.ObjectId();
const request = new Request("http://127.0.0.1:3000/api/pulse");
const member = () => User.create({ email: "host@iitg.ac.in", access: "Member", roles: [{ position: "OC" }] });
type Member = Awaited<ReturnType<typeof member>>;
function signIn(user: Member, authProvider: unknown = "microsoft") {
  getSession.mockResolvedValue({ user: { id: user.id, email: user.email, access: user.access }, session: { authProvider } });
}
function pendingQuiz(role: "owner" | "cohost" = "owner") {
  return PulseQuiz.create({
    roomCode: "A7K9P2", ...(role === "cohost" ? { ownerId: id() } : {}),
    hostAssignments: [{ email: " HOST@IITG.ac.in ", role, assignedBy: id() }],
  });
}
function link(user: Member, email = user.email!, authProvider: unknown = "microsoft") {
  return linkHostAssignmentsForUser({ userId: user.id, email, authProvider });
}
beforeAll(async () => {
  await startTestMongo();
  await Promise.all([User.init(), PulseQuiz.init(), PulseAuditEvent.init()]);
});
afterEach(async () => { getSession.mockReset(); await clearTestMongo(); });
afterAll(stopTestMongo);

describe("Pulse authorization", () => {
  it("denies logged-out callers and unassigned members", async () => {
    getSession.mockResolvedValue(null);
    for (const result of [await getPulseSession(request), await requireAdmin(request), await requirePulseHost(request, id().toString())])
      expect(result).toMatchObject({ error: { code: "PULSE_NOT_AUTHORIZED" } });
    const quiz = await PulseQuiz.create({ ownerId: id(), roomCode: "A7K9P2" });
    signIn(await member());
    expect(await requirePulseHost(request, quiz.id)).toMatchObject({ error: { code: "PULSE_NOT_HOST" } });
  });
  it.each(["owner", "cohost"] as const)("links a pending %s before authorizing the same request", async (role) => {
    const user = await member();
    const quiz = await pendingQuiz(role);
    signIn(user);
    expect(await requirePulseHost(request, quiz.id)).toMatchObject({ ok: true, data: { role } });
    expect(await PulseAuditEvent.countDocuments({ quizId: quiz._id, type: "host.linked" })).toBe(1);
  });
  it("uses CCW Head/Admin access without granting automatic host access", async () => {
    const quiz = await PulseQuiz.create({ ownerId: id(), roomCode: "A7K9P2" });
    signIn(await User.create({ email: "admin@iitg.ac.in", access: "Admin" }));
    expect((await requireAdmin(request)).ok).toBe(true);
    expect(await requireHostOrAdmin(request, quiz.id)).toMatchObject({ ok: true, data: { role: "admin" } });
    expect(await requirePulseHost(request, quiz.id)).toMatchObject({ error: { code: "PULSE_NOT_HOST" } });
    signIn(await User.create({ email: "head@iitg.ac.in", access: "Head", managedModules: ["Software Development"] }));
    expect((await requireAdmin(request)).ok).toBe(true);
    expect(await requireHostOrAdmin(request, quiz.id)).toMatchObject({ ok: true, data: { role: "admin" } });
    expect(await requirePulseHost(request, quiz.id)).toMatchObject({ error: { code: "PULSE_NOT_HOST" } });
  });
  it("returns missing-quiz and invalid-ID errors", async () => {
    signIn(await member());
    expect(await requirePulseHost(request, id().toString())).toMatchObject({ error: { code: "PULSE_QUIZ_NOT_FOUND" } });
    expect(await requirePulseHost(request, "bad")).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});

describe("Pulse assignment persistence", () => {
  it.each(["owner", "cohost"] as const)("links a normalized %s once under concurrent calls without changing CCW roles", async (role) => {
    const user = await member();
    const before = await User.findById(user._id).lean();
    const quiz = await pendingQuiz(role);
    const results = await Promise.all([link(user, " HOST@IITG.ac.in "), link(user), link(user)]);
    expect(results.reduce((total, result) => total + result.linkedCount, 0)).toBe(1);
    const found = await PulseQuiz.findById(quiz._id).lean();
    expect(found?.hostAssignments[0].userId?.toString()).toBe(user.id);
    expect(found?.hostAssignments[0].linkedAt).toBeInstanceOf(Date);
    if (role === "owner") expect(found?.ownerId?.toString()).toBe(user.id);
    else expect(found?.coHostIds.map(String)).toEqual([user.id]);
    expect(await link(user)).toEqual({ linkedCount: 0 });
    const audits = await PulseAuditEvent.find({ quizId: quiz._id }).lean();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ type: "host.linked", actor: { role }, metadata: { role } });
    expect(await User.findById(user._id).lean()).toEqual(before);
  });
  it("leaves never-signed-in and unrelated email assignments pending", async () => {
    const quiz = await pendingQuiz();
    const user = await User.create({ email: "other@iitg.ac.in" });
    expect(await link(user)).toEqual({ linkedCount: 0 });
    expect(await link(user, "host@iitg.ac.in")).toEqual({ linkedCount: 0 });
    const found = await PulseQuiz.findById(quiz._id).lean();
    expect(found?.ownerId).toBeNull();
    expect(found?.hostAssignments[0].userId).toBeUndefined();
    expect(await PulseAuditEvent.countDocuments()).toBe(0);
  });
  it("does not bind Google, development or unstamped sessions, or Gmail identities", async () => {
    const user = await member();
    const quiz = await pendingQuiz();
    for (const provider of ["google", "development", null]) {
      expect(await link(user, user.email!, provider)).toEqual({ linkedCount: 0 });
      signIn(user, provider);
      expect(await requirePulseHost(request, quiz.id)).toMatchObject({ error: { code: "PULSE_NOT_HOST" } });
    }
    const gmail = await User.create({ email: "host@gmail.com" });
    expect(await link(gmail)).toEqual({ linkedCount: 0 });
    expect(await PulseAuditEvent.countDocuments()).toBe(0);
  });
  it("matches email and pending userId on the same assignment", async () => {
    const user = await member();
    const quiz = await PulseQuiz.create({ ownerId: id(), roomCode: "A7K9P2", hostAssignments: [
      { email: user.email, role: "cohost", userId: user._id, assignedBy: id() },
      { email: "other@iitg.ac.in", role: "cohost", assignedBy: id() },
    ] });
    expect(await link(user)).toEqual({ linkedCount: 0 });
    expect((await PulseQuiz.findById(quiz._id).lean())?.coHostIds).toEqual([]);
    expect(await PulseAuditEvent.countDocuments()).toBe(0);
  });
  it("does not replace an existing owner or bind removed assignments", async () => {
    const user = await member();
    const quiz = await pendingQuiz();
    const originalOwner = id();
    await PulseQuiz.updateOne({ _id: quiz._id }, { $set: { ownerId: originalOwner } });
    expect(await link(user)).toEqual({ linkedCount: 0 });
    expect((await PulseQuiz.findById(quiz._id))?.ownerId?.equals(originalOwner)).toBe(true);
    await PulseQuiz.updateOne({ _id: quiz._id }, { $set: { ownerId: null, hostAssignments: [] } });
    expect(await link(user)).toEqual({ linkedCount: 0 });
    expect(await PulseAuditEvent.countDocuments()).toBe(0);
  });
  it("rolls back linking when the audit cannot be persisted", async () => {
    const user = await member();
    const quiz = await pendingQuiz();
    const db = mongoose.connection.db!;
    await db.command({ collMod: "pulse_audit_events", validator: { type: { $eq: "reject-all-events" } }, validationLevel: "strict" });
    try {
      await expect(link(user)).rejects.toThrow();
      const found = await PulseQuiz.findById(quiz._id).lean();
      expect(found?.ownerId).toBeNull();
      expect(found?.hostAssignments[0].userId).toBeUndefined();
      expect(await PulseAuditEvent.countDocuments()).toBe(0);
      signIn(user);
      await expect(requirePulseHost(request, quiz.id)).rejects.toThrow();
    } finally {
      await db.command({ collMod: "pulse_audit_events", validator: {} });
    }
  });
});

describe("Pulse route error contract", () => {
  it.each([["PULSE_NOT_AUTHORIZED", 403], ["PULSE_NOT_HOST", 403], ["PULSE_QUIZ_NOT_FOUND", 404]] as const)("maps %s to HTTP %s and JSON", async (code, status) => {
    const response = await pulseRoute(request, async () => { throw new PulseError(code, "Safe message."); });
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: false, error: { code, message: "Safe message." } });
    expect((await pulseRoute(request, async () => err(code, "Safe message."))).status).toBe(status);
  });
  it("preserves successes and masks unexpected details", async () => {
    expect(await (await pulseRoute(request, async () => ok({ title: "Quiz" }))).json()).toEqual({ ok: true, data: { title: "Quiz" } });
    const response = await pulseRoute(request, async () => { throw new Error("private database details"); });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toContain("private database details");
  });
});
