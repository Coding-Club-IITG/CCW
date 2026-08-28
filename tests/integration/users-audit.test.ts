import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const getSession = vi.hoisted(() => vi.fn());
const invalidateCache = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cache")>()),
  invalidateCache,
}));

describe("administrative user audit", () => {
  beforeAll(startTestMongo);
  afterEach(async () => {
    await clearTestMongo();
    vi.clearAllMocks();
  });
  afterAll(stopTestMongo);

  it("records every privileged user mutation without contact data", async () => {
    getSession.mockResolvedValue({
      user: { id: "admin-1", name: "Global Admin", access: "Admin" },
      session: { id: "session-1", userId: "admin-1" },
    });
    const {
      addUser,
      deleteUser,
      updateUserAccess,
      updateUserPizzaCount,
      updateUserRoles,
      updateUserTenure,
    } = await import("@/lib/actions/user");

    const created = await addUser("private@example.test", "Audited Member");
    expect(created.ok).toBe(true);
    const user = await User.findOne({ name: "Audited Member" });
    expect(user).not.toBeNull();
    const userId = user!._id.toString();

    await expect(
      updateUserRoles(userId, [{ module: "Design", position: "Core Team" }]),
    ).resolves.toMatchObject({ ok: true });
    await expect(updateUserTenure(userId, "2025-26")).resolves.toMatchObject({
      ok: true,
    });
    await expect(updateUserPizzaCount(userId, 1)).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      updateUserAccess(userId, "Head", ["Design"]),
    ).resolves.toMatchObject({ ok: true });
    await expect(deleteUser(userId)).resolves.toMatchObject({ ok: true });

    const audits = await AuditLog.find().sort({ _id: 1 }).lean();
    expect(audits.map((event) => event.operation)).toEqual([
      "users.create",
      "users.roles.update",
      "users.tenure.update",
      "users.pizza_count.update",
      "users.access.update",
      "users.delete",
    ]);
    expect(audits[1]).toMatchObject({
      before: { roles: [] },
      after: { roles: ["Design:Core Team"] },
    });
    expect(audits[4]).toMatchObject({
      before: { access: "Member", managedModules: [] },
      after: { access: "Head", managedModules: ["Design"] },
    });
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain("private@example.test");
    expect(serialized).not.toContain("phoneNumber");
    expect(serialized).not.toContain("codeforcesId");
  });

  it("does not record a denied user mutation", async () => {
    getSession.mockResolvedValue({
      user: { id: "member-1", name: "Member", access: "Member" },
      session: { id: "session-2", userId: "member-1" },
    });
    const { addUser } = await import("@/lib/actions/user");

    await expect(addUser("blocked@example.test")).resolves.toMatchObject({
      ok: false,
    });
    expect(await User.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });
});
