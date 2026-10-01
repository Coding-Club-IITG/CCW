import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  startTestMongo,
  createTestAuthIndexes,
  clearTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import User from "@/models/User";
import LoginSwitchRequest from "@/models/LoginSwitchRequest";
import AuditLog from "@/models/AuditLog";
import Notification from "@/models/Notification";
import CPUser from "@/models/CPUser";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/userRateLimit", () => ({
  consumeUserRateLimit: async () => ({ allowed: true }),
}));
vi.mock("@/lib/push/config", () => ({ webPushConfigured: false }));
vi.mock("@/lib/push/queue", () => ({
  pushNotificationQueue: { addBulk: vi.fn() },
}));
vi.mock("@/lib/cache", () => ({ invalidateCache: vi.fn() }));

async function member(name = "Member", access: "Member" | "Admin" = "Member") {
  const user = await User.create({
    name,
    email: `${name.toLowerCase()}@iitg.ac.in`,
    access,
    tenure: "2018-19",
    roles: [{ module: "Design", position: "Core Team" }],
    pizza_count: 3,
    bio: "History",
  });
  const store = await import("@/lib/authStore");
  const { accounts, sessions } = await store.authCollections();
  await accounts.insertOne({
    userId: user._id,
    providerId: "microsoft",
    accountId: `ms-${user.id}`,
    accessToken: "must-be-removed",
  });
  const id = new mongoose.Types.ObjectId();
  const sourceSession = {
    id: String(id),
    userId: user.id,
    createdAt: new Date(),
    authProvider: "microsoft",
  };
  await sessions.insertOne({
    _id: id,
    userId: user._id,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    authProvider: "microsoft",
    token: `session-${id}`,
  });
  return {
    user,
    actor: { id: user.id, name: user.name, access: user.access },
    sourceSession,
  };
}

async function draft(
  fixture: Awaited<ReturnType<typeof member>>,
  email = "alumni@gmail.com",
) {
  const { verifySwitchDraft } = await import("@/lib/loginSwitch");
  return verifySwitchDraft(fixture.actor, fixture.sourceSession, {
    email,
    id: `google-${email}`,
    emailVerified: true,
  });
}
async function submitted() {
  const fixture = await member();
  const request = await draft(fixture);
  const { mutateLoginSwitch } = await import("@/lib/loginSwitch");
  await mutateLoginSwitch(
    fixture.actor,
    request.id,
    "submit",
    "",
    fixture.sourceSession.id,
  );
  return { ...fixture, request };
}

describe("verified login switching", () => {
  beforeAll(async () => {
    await startTestMongo();
    await Promise.all([
      User.init(),
      LoginSwitchRequest.init(),
      AuditLog.init(),
      Notification.init(),
      CPUser.init(),
    ]);
    await createTestAuthIndexes();
  });
  afterEach(async () => {
    await clearTestMongo();
    vi.restoreAllMocks();
  });
  afterAll(stopTestMongo);

  it("verifies ownership without activating Google or replacing the institute session", async () => {
    const fixture = await member();
    const request = await draft(fixture);
    expect(request.status).toBe("draft");
    const saved = await LoginSwitchRequest.findById(request.id).lean();
    expect(
      saved!.expiresAt.getTime() - saved!.verifiedAt.getTime(),
    ).toBeLessThanOrEqual(600000);
    const { accounts, sessions } = await (
      await import("@/lib/authStore")
    ).authCollections();
    expect(await accounts.countDocuments({ providerId: "google" })).toBe(0);
    expect(await sessions.countDocuments()).toBe(1);
    expect((await User.findById(fixture.user.id))!.email).toBe(
      "member@iitg.ac.in",
    );
    expect(JSON.stringify(saved)).not.toContain("accessToken");
  });

  it("requires a recent institute session, verified Gmail and the initiating user", async () => {
    const fixture = await member();
    const { verifySwitchDraft } = await import("@/lib/loginSwitch");
    const google = {
      email: "alumni@gmail.com",
      id: "google",
      emailVerified: true,
    };
    await expect(
      verifySwitchDraft(
        fixture.actor,
        { ...fixture.sourceSession, createdAt: new Date(Date.now() - 600001) },
        google,
      ),
    ).rejects.toThrow();
    await expect(
      verifySwitchDraft(
        fixture.actor,
        { ...fixture.sourceSession, authProvider: "google" },
        google,
      ),
    ).rejects.toThrow();
    await expect(
      verifySwitchDraft(
        fixture.actor,
        {
          ...fixture.sourceSession,
          userId: new mongoose.Types.ObjectId().toString(),
        },
        google,
      ),
    ).rejects.toThrow();
    await expect(
      verifySwitchDraft(fixture.actor, fixture.sourceSession, {
        ...google,
        emailVerified: false,
      }),
    ).rejects.toThrow();
    await expect(
      verifySwitchDraft(fixture.actor, fixture.sourceSession, {
        ...google,
        email: "alumni@googlemail.com",
      }),
    ).rejects.toThrow();
  });

  it("enforces one active request and refuses occupied destinations", async () => {
    const fixture = await member();
    await User.create({ name: "Existing", email: "taken@gmail.com" });
    await expect(draft(fixture, "taken@gmail.com")).rejects.toThrow(
      /unavailable/,
    );
    await draft(fixture);
    await expect(draft(fixture, "second@gmail.com")).rejects.toThrow(
      /existing request/,
    );
  });

  it("approves once, revokes sessions and preserves identity, roles, activity and tenure", async () => {
    const reviewer = await member("Reviewer", "Admin");
    const fixture = await submitted();
    await CPUser.create({ userId: fixture.user.id, cfHandle: "preserved" });
    const { mutateLoginSwitch } = await import("@/lib/loginSwitch");
    const results = await Promise.allSettled([
      mutateLoginSwitch(reviewer.actor, fixture.request.id, "approve"),
      mutateLoginSwitch(reviewer.actor, fixture.request.id, "approve"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const saved = await User.findById(fixture.user.id).lean();
    expect(saved).toMatchObject({
      email: "alumni@gmail.com",
      instituteEmail: "member@iitg.ac.in",
      access: "Member",
      tenure: "2018-19",
      pizza_count: 3,
      bio: "History",
      roles: [{ module: "Design", position: "Core Team" }],
    });
    expect(await CPUser.countDocuments({ userId: fixture.user.id })).toBe(1);
    const { accounts, sessions } = await (
      await import("@/lib/authStore")
    ).authCollections();
    expect(await sessions.countDocuments({ userId: fixture.user._id })).toBe(0);
    expect(await accounts.findOne({ userId: fixture.user._id })).toMatchObject({
      providerId: "google",
      accountId: "google-alumni@gmail.com",
    });
    expect(
      await accounts.findOne({ userId: fixture.user._id }),
    ).not.toHaveProperty("accessToken");
    expect(
      await AuditLog.countDocuments({
        operation: "users.login_switch.approved",
      }),
    ).toBe(1);
    expect(
      await Notification.countDocuments({
        userId: fixture.user.id,
        title: "Google login approved",
      }),
    ).toBe(1);
    const audits = JSON.stringify(await AuditLog.find().lean());
    expect(audits).not.toContain("@gmail.com");
    expect(audits).not.toContain("must-be-removed");
  });

  it("rejects unauthorized, self and repeated reviews", async () => {
    const fixture = await submitted();
    const { mutateLoginSwitch } = await import("@/lib/loginSwitch");
    await expect(
      mutateLoginSwitch(fixture.actor, fixture.request.id, "approve"),
    ).rejects.toThrow();
    await expect(
      mutateLoginSwitch(
        { ...fixture.actor, access: "Admin" },
        fixture.request.id,
        "approve",
      ),
    ).rejects.toThrow(/Another/);
    const reviewer = await member("Reviewer", "Admin");
    await mutateLoginSwitch(
      reviewer.actor,
      fixture.request.id,
      "reject",
      "Please use your own account",
    );
    expect((await User.findById(fixture.user.id))!.email).toBe(
      "member@iitg.ac.in",
    );
    expect(
      (await LoginSwitchRequest.findById(fixture.request.id))!.reason,
    ).toContain("own account");
    await expect(
      mutateLoginSwitch(reviewer.actor, fixture.request.id, "approve"),
    ).rejects.toThrow();
  });

  it("cancels and expires requests without changing institute access", async () => {
    const fixture = await submitted();
    const { mutateLoginSwitch, expireLoginSwitchRequests } =
      await import("@/lib/loginSwitch");
    await mutateLoginSwitch(fixture.actor, fixture.request.id, "cancel");
    const replacement = await draft(fixture, "replacement@gmail.com");
    await mutateLoginSwitch(
      fixture.actor,
      replacement.id,
      "submit",
      "",
      fixture.sourceSession.id,
    );
    await LoginSwitchRequest.updateOne(
      { _id: replacement.id },
      { $set: { expiresAt: new Date(Date.now() - 1) } },
    );
    await expireLoginSwitchRequests(fixture.actor);
    expect((await LoginSwitchRequest.findById(replacement.id))!.status).toBe(
      "expired",
    );
    expect((await User.findById(fixture.user.id))!.email).toBe(
      "member@iitg.ac.in",
    );
    expect(
      await Notification.countDocuments({ title: "Login request expired" }),
    ).toBe(1);
  });

  it("rechecks destination availability and rolls everything back when audit persistence fails", async () => {
    const fixture = await submitted();
    const reviewer = await member("Reviewer", "Admin");
    const { mutateLoginSwitch } = await import("@/lib/loginSwitch");
    const taken = await User.create({ email: "alumni@gmail.com" });
    await expect(
      mutateLoginSwitch(reviewer.actor, fixture.request.id, "approve"),
    ).rejects.toThrow(/unavailable/);
    await User.deleteOne({ _id: taken._id });
    vi.spyOn(AuditLog, "create").mockRejectedValueOnce(
      new Error("audit storage failure"),
    );
    await expect(
      mutateLoginSwitch(reviewer.actor, fixture.request.id, "approve"),
    ).rejects.toThrow(/audit storage/);
    expect((await User.findById(fixture.user.id))!.email).toBe(
      "member@iitg.ac.in",
    );
    expect(
      (await LoginSwitchRequest.findById(fixture.request.id))!.status,
    ).toBe("pending");
    const { sessions, accounts } = await (
      await import("@/lib/authStore")
    ).authCollections();
    expect(await sessions.countDocuments({ userId: fixture.user._id })).toBe(1);
    expect(
      (await accounts.findOne({ userId: fixture.user._id }))!.providerId,
    ).toBe("microsoft");
    expect(
      await Notification.countDocuments({ title: "Google login approved" }),
    ).toBe(0);
  });

  it("validates action inputs and protects proof from other members", async () => {
    const fixture = await submitted();
    const other = await member("Other");
    const actions = await import("@/lib/actions/loginSwitch");
    getSession.mockResolvedValue({
      user: other.actor,
      session: other.sourceSession,
    });
    expect(await actions.cancelLoginSwitch(fixture.request.id)).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await actions.listLoginSwitchRequests()).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(await actions.submitLoginSwitch("bad-id")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(await actions.getOwnLoginSwitch()).toMatchObject({
      ok: true,
      data: { request: null },
    });
  });
  it("serializes reviews competing for the same Google destination", async () => {
    const first = await submitted();
    const second = await member("Second");
    const secondRequest = await draft(second);
    const reviewer = await member("Reviewer", "Admin");
    const { mutateLoginSwitch } = await import("@/lib/loginSwitch");
    await mutateLoginSwitch(
      second.actor,
      secondRequest.id,
      "submit",
      "",
      second.sourceSession.id,
    );
    const outcomes = await Promise.allSettled([
      mutateLoginSwitch(reviewer.actor, first.request.id, "approve"),
      mutateLoginSwitch(reviewer.actor, secondRequest.id, "approve"),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === "fulfilled"),
    ).toHaveLength(1);
    expect(await User.countDocuments({ email: "alumni@gmail.com" })).toBe(1);
    expect(await LoginSwitchRequest.countDocuments({ status: "pending" })).toBe(
      1,
    );
    expect(
      await AuditLog.countDocuments({
        operation: "users.login_switch.approved",
      }),
    ).toBe(1);
  });

  it("checks draft session binding, expired requests and changed source identities at mutation time", async () => {
    const fixture = await member();
    const request = await draft(fixture);
    const reviewer = await member("Reviewer", "Admin");
    const { mutateLoginSwitch } = await import("@/lib/loginSwitch");
    await expect(
      mutateLoginSwitch(
        fixture.actor,
        request.id,
        "submit",
        "",
        "other-session",
      ),
    ).rejects.toThrow(/this institute session/);
    await mutateLoginSwitch(
      fixture.actor,
      request.id,
      "submit",
      "",
      fixture.sourceSession.id,
    );
    await LoginSwitchRequest.updateOne(
      { _id: request.id },
      { $set: { expiresAt: new Date(Date.now() - 1) } },
    );
    await expect(
      mutateLoginSwitch(reviewer.actor, request.id, "approve"),
    ).rejects.toThrow(/no longer active/);
    await LoginSwitchRequest.updateOne(
      { _id: request.id },
      { $set: { expiresAt: new Date(Date.now() + 100000) } },
    );
    const { accounts } = await (
      await import("@/lib/authStore")
    ).authCollections();
    await accounts.updateOne(
      { userId: fixture.user._id },
      { $set: { accountId: "changed" } },
    );
    await expect(
      mutateLoginSwitch(reviewer.actor, request.id, "approve"),
    ).rejects.toThrow(/changed/);
  });

  it("lists only submitted requests for reviewers and applies validated status and pagination", async () => {
    const fixture = await submitted();
    const second = await member("Second");
    await draft(second, "second@gmail.com");
    const cancelled = await member("Cancelled");
    const cancelledDraft = await draft(cancelled, "cancelled@gmail.com");
    const { mutateLoginSwitch } = await import("@/lib/loginSwitch");
    await mutateLoginSwitch(cancelled.actor, cancelledDraft.id, "cancel");
    const expired = await member("Expired");
    const expiredDraft = await draft(expired, "expired@gmail.com");
    await LoginSwitchRequest.updateOne(
      { _id: expiredDraft.id },
      { $set: { expiresAt: new Date(Date.now() - 1) } },
    );
    const reviewer = await member("Reviewer", "Admin");
    const actions = await import("@/lib/actions/loginSwitch");
    getSession.mockResolvedValue({
      user: reviewer.actor,
      session: reviewer.sourceSession,
    });
    expect(
      await actions.listLoginSwitchRequests({ status: "all" }),
    ).toMatchObject({
      ok: true,
      data: { total: 1, items: [{ id: fixture.request.id }] },
    });
    expect(
      await actions.listLoginSwitchRequests({ status: "pending", page: 2 }),
    ).toMatchObject({ ok: true, data: { total: 1, items: [] } });
    expect(
      await actions.listLoginSwitchRequests({ status: "draft" }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await actions.listLoginSwitchRequests({ page: 0 })).toMatchObject({
      ok: false,
    });
    expect(
      await actions.reviewLoginSwitch(
        fixture.request.id,
        "reject",
        "x".repeat(301),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await actions.reviewLoginSwitch(fixture.request.id, "reject", "Reviewed"),
    ).toMatchObject({ ok: true });
    expect(
      await actions.listLoginSwitchRequests({ status: "rejected" }),
    ).toMatchObject({ ok: true, data: { total: 1 } });
    getSession.mockResolvedValue({
      user: second.actor,
      session: second.sourceSession,
    });
    const own = await actions.getOwnLoginSwitch();
    expect(own.ok).toBe(true);
    if (own.ok) {
      expect(own.data.request).not.toHaveProperty("googleAccountId");
      expect(own.data.request).not.toHaveProperty("sourceSessionId");
      expect(
        await actions.submitLoginSwitch(own.data.request!.id),
      ).toMatchObject({ ok: true });
      expect(
        await actions.cancelLoginSwitch(own.data.request!.id),
      ).toMatchObject({ ok: true });
    }
  });
});
