import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import CPUser from "@/models/CPUser";
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
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/cache/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cache/redis")>()),
  invalidateCache: mocks.invalidateCache,
}));

let avatarDirectory: string;
const previousAvatarDirectory = process.env.AVATAR_UPLOAD_DIR;

beforeAll(async () => {
  await startTestMongo();
  await CPUser.createIndexes();
  avatarDirectory = await mkdtemp(path.join(tmpdir(), "ccw-profile-test-"));
  process.env.AVATAR_UPLOAD_DIR = avatarDirectory;
});
beforeEach(() => vi.clearAllMocks());
afterEach(clearTestMongo);
afterAll(async () => {
  await stopTestMongo();
  await rm(avatarDirectory, { recursive: true, force: true });
  if (previousAvatarDirectory === undefined)
    delete process.env.AVATAR_UPLOAD_DIR;
  else process.env.AVATAR_UPLOAD_DIR = previousAvatarDirectory;
});

async function seedMember() {
  const user = await User.create({
    name: "Original Name",
    email: "profile@iitg.ac.in",
    codeforcesId: "original_cf",
    atcoderId: "original_ac",
  });
  const cpUser = await CPUser.create({
    userId: user._id,
    cfHandle: "original_cf",
    acHandle: "original_ac",
    cfVerified: true,
    acVerified: true,
    cfVerificationToken: "cf-token",
    acVerificationToken: "ac-token",
    cfVerificationRequestedAt: new Date("2026-08-01T10:00:00Z"),
    acVerificationRequestedAt: new Date("2026-08-01T10:00:00Z"),
  });
  mocks.getSession.mockResolvedValue({
    user: { id: String(user._id), access: "Member" },
  });
  return { user, cpUser };
}

describe("profile and verified identities", () => {
  it.each(["codeforces", "atcoder"])(
    "rolls back the whole profile when a %s handle is already linked",
    async (platform) => {
      const { user, cpUser } = await seedMember();
      await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        ...(platform === "codeforces"
          ? { cfHandle: "taken_cf" }
          : { acHandle: "taken_ac" }),
      });
      const { updateProfile } = await import("@/lib/actions/users");
      const result = await updateProfile({
        name: "Changed Name",
        codeforcesId: platform === "codeforces" ? "taken_cf" : "new_cf",
        atcoderId: platform === "atcoder" ? "taken_ac" : "new_ac",
      });
      expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
      expect(await User.findById(user._id).lean()).toEqual(user.toObject());
      expect(await CPUser.findById(cpUser._id).lean()).toEqual(
        cpUser.toObject(),
      );
      expect(mocks.invalidateCache).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("commits both handle changes with verification and tokens cleared", async () => {
    const { user } = await seedMember();
    const { updateProfile } = await import("@/lib/actions/users");
    const result = await updateProfile({
      name: "Changed Name",
      codeforcesId: "new_cf",
      atcoderId: "new_ac",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { handleChanged: true, acHandleChanged: true },
    });
    expect(await User.findById(user._id).lean()).toMatchObject({
      name: "Changed Name",
      codeforcesId: "new_cf",
      atcoderId: "new_ac",
    });
    expect(await CPUser.findOne({ userId: user._id }).lean()).toMatchObject({
      cfHandle: "new_cf",
      acHandle: "new_ac",
      cfVerified: false,
      acVerified: false,
      cfVerificationToken: "",
      acVerificationToken: "",
      cfVerificationRequestedAt: null,
      acVerificationRequestedAt: null,
    });
  });

  it("preserves verification for unchanged handles", async () => {
    const { cpUser } = await seedMember();
    const { updateProfile } = await import("@/lib/actions/users");
    expect(
      await updateProfile({
        name: "Changed Name",
        codeforcesId: "original_cf",
        atcoderId: "original_ac",
      }),
    ).toMatchObject({
      ok: true,
      data: { handleChanged: false, acHandleChanged: false },
    });
    expect(await CPUser.findById(cpUser._id).lean()).toEqual(cpUser.toObject());
  });

  it("returns not found for a deleted member without creating a platform identity", async () => {
    const { user } = await seedMember();
    await User.deleteOne({ _id: user._id });
    const { updateProfile } = await import("@/lib/actions/users");
    expect(await updateProfile({ name: "Changed Name" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await CPUser.countDocuments()).toBe(1);
  });
});

describe("profile avatar retention", () => {
  it("cannot delete another member's avatar by assigning its URL and replacing it", async () => {
    const { user } = await seedMember();
    const filename = "abcdef1234.png";
    await writeFile(
      path.join(avatarDirectory, filename),
      "other member avatar",
    );
    const other = await User.create({
      name: "Other",
      image: `/api/profile/assets/${filename}`,
    });
    const { updateProfile } = await import("@/lib/actions/users");
    expect(
      await updateProfile({
        name: user.name!,
        image: other.image ?? undefined,
      }),
    ).toMatchObject({ ok: true });
    expect(await updateProfile({ name: user.name!, image: "" })).toMatchObject({
      ok: true,
    });
    expect(await readFile(path.join(avatarDirectory, filename), "utf8")).toBe(
      "other member avatar",
    );
    expect((await User.findById(other._id).lean())?.image).toBe(other.image);
  });
});
