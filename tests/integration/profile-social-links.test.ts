import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import User from "@/models/User";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cache")>()),
  invalidateCache: mocks.invalidateCache,
}));

async function seedMember() {
  const user = await User.create({
    _id: new mongoose.Types.ObjectId(),
    name: "Member One",
    email: "member.one@iitg.ac.in",
    tenure: "2026-27",
  });
  mocks.getSession.mockResolvedValue({
    user: { id: String(user._id), access: "Member" },
    session: { id: "session", userId: String(user._id) },
  });
  return user;
}

describe("member profile social links", () => {
  beforeAll(startTestMongo);
  beforeEach(() => vi.clearAllMocks());
  afterEach(clearTestMongo);
  afterAll(stopTestMongo);

  it("stores a normalized LinkedIn URL", async () => {
    const user = await seedMember();
    const { updateProfile } = await import("@/lib/actions/user");

    const result = await updateProfile({
      name: "Member One",
      linkedinUrl: "https://www.linkedin.com/in/member-one/?utm_source=x",
    });
    expect(result.ok).toBe(true);

    expect((await User.findById(user._id).lean())?.linkedinUrl).toBe(
      "https://www.linkedin.com/in/member-one",
    );
    expect(mocks.invalidateCache).toHaveBeenCalledWith("home");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("clears the link when the field is emptied", async () => {
    const user = await seedMember();
    await User.findByIdAndUpdate(user._id, {
      linkedinUrl: "https://linkedin.com/in/member-one",
    });
    const { updateProfile } = await import("@/lib/actions/user");

    const result = await updateProfile({ name: "Member One", linkedinUrl: "" });
    expect(result.ok).toBe(true);
    expect((await User.findById(user._id).lean())?.linkedinUrl).toBe("");
  });

  it.each([
    ["a non-LinkedIn host", "https://example.com/in/member-one"],
    ["a non-https scheme", "http://linkedin.com/in/member-one"],
    ["a lookalike domain", "https://linkedin.com.evil.tld/in/member-one"],
  ])("rejects %s", async (_label, linkedinUrl) => {
    const user = await seedMember();
    const { updateProfile } = await import("@/lib/actions/user");

    const result = await updateProfile({ name: "Member One", linkedinUrl });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect((await User.findById(user._id).lean())?.linkedinUrl ?? "").toBe("");
  });

  it("requires a session", async () => {
    await seedMember();
    mocks.getSession.mockResolvedValue(null);
    const { updateProfile } = await import("@/lib/actions/user");

    await expect(
      updateProfile({
        name: "Member One",
        linkedinUrl: "https://linkedin.com/in/member-one",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("leaves users created before the field valid", async () => {
    await User.collection.insertOne({
      name: "Legacy Member",
      email: "legacy@iitg.ac.in",
      tenure: "2025-26",
      access: "Member",
      managedModules: [],
      roles: [],
    });

    const legacy = await User.findOne({ name: "Legacy Member" }).lean();
    expect(legacy).not.toBeNull();
    expect(legacy?.linkedinUrl ?? "").toBe("");
  });
});
