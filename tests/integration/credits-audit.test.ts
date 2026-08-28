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
import Credits from "@/models/Credits";
import User from "@/models/User";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const getSession = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/cache", () => ({ revalidatePath }));

describe("credits audit", () => {
  beforeAll(startTestMongo);
  afterEach(async () => {
    await clearTestMongo();
    vi.clearAllMocks();
  });
  afterAll(stopTestMongo);

  it("records only section headings and aggregate counts", async () => {
    getSession.mockResolvedValue({
      user: { id: "head-1", name: "Credits Head", access: "Head" },
      session: { id: "session-1", userId: "head-1" },
    });
    const contributor = await User.create({
      name: "Contributor Identity",
      email: "contributor@example.test",
    });
    const { saveCredits } = await import("@/lib/actions/credits");

    await expect(
      saveCredits([
        {
          heading: "Website Team",
          entries: [{ userId: contributor._id.toString(), period: "2025-26" }],
        },
      ]),
    ).resolves.toEqual({ ok: true, data: {} });

    expect(await Credits.countDocuments()).toBe(1);
    const audit = await AuditLog.findOne().lean();
    expect(audit).toMatchObject({
      category: "credits",
      action: "update",
      operation: "credits.update",
      before: { headings: [], sectionCount: 0, entryCount: 0 },
      after: {
        headings: ["Website Team"],
        sectionCount: 1,
        entryCount: 1,
      },
    });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("Contributor Identity");
    expect(serialized).not.toContain("contributor@example.test");
    expect(serialized).not.toContain(contributor._id.toString());
  });

  it("does not record a member's rejected edit", async () => {
    getSession.mockResolvedValue({
      user: { id: "member-1", name: "Member", access: "Member" },
      session: { id: "session-2", userId: "member-1" },
    });
    const { saveCredits } = await import("@/lib/actions/credits");

    await expect(saveCredits([])).resolves.toMatchObject({ ok: false });
    expect(await Credits.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments()).toBe(0);
  });
});
