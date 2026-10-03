import mongoose from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

import { getContestById, getContestListing } from "@/lib/actions/contests";
import type { ContestViewer } from "@/lib/access/contests";

import ContestMatch, { type IContestMatch } from "@/models/ContestMatch";
import ContestRoom from "@/models/ContestRoom";
import CPUser from "@/models/CPUser";

import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/contests/queues", () => ({
  reconciliationQueue: { add: vi.fn() },
  cfSyncQueue: { add: vi.fn() },
}));

beforeAll(startTestMongo);
beforeEach(() => getSession.mockResolvedValue(null));
afterEach(clearTestMongo);
afterAll(stopTestMongo);

function viewer(overrides: Partial<ContestViewer> = {}): ContestViewer {
  return {
    id: new mongoose.Types.ObjectId().toString(),
    access: "Member",
    ...overrides,
  };
}

function signIn(user: ContestViewer) {
  getSession.mockResolvedValue({ user });
}

async function fixture(overrides: Partial<IContestMatch> = {}) {
  const owner = viewer();
  const profile = await CPUser.create({
    userId: owner.id,
    cfHandle: "read_access_owner",
    cfVerified: true,
  });
  const contest = await ContestMatch.create({
    name: "Read access tournament",
    description: "Internal contest details",
    creatorId: profile._id,
    format: "bracket",
    mode: "blitz",
    status: "registration",
    teamSize: 1,
    spectatorRestriction: "none",
    problemSelectionMode: "test",
    ...overrides,
  });

  return { contest, owner, id: String(contest._id) };
}

it("rejects anonymous listing and detail requests without returning contest data", async () => {
  const { id } = await fixture();

  for (const result of [await getContestListing(), await getContestById(id)]) {
    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    expect(result).not.toHaveProperty("data");
  }
});

it("validates detail IDs and reports missing contests", async () => {
  signIn(viewer());

  expect(await getContestById("invalid")).toMatchObject({
    ok: false,
    error: { code: "VALIDATION_ERROR" },
  });
  expect(
    await getContestById(new mongoose.Types.ObjectId().toString()),
  ).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
});

it.each(["Member", "Head", "Admin"])(
  "denies an unregistered %s when spectators are disabled",
  async (access) => {
    const { id } = await fixture();
    signIn(viewer({ access }));

    expect(await getContestById(id)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  },
);

it("preserves authenticated contest discovery without granting detail access", async () => {
  const { id } = await fixture();
  signIn(viewer());

  const listing = await getContestListing();

  expect(listing.ok).toBe(true);

  if (listing.ok) {
    expect(listing.data.upcoming).toEqual([
      expect.objectContaining({ _id: id, canSpectate: false }),
    ]);
  }

  expect(await getContestById(id)).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
});

it("allows a registered participant without spectator permission", async () => {
  const player = viewer();
  const { id } = await fixture({
    registrations: [
      {
        userId: new mongoose.Types.ObjectId(player.id),
        cfHandle: "read_access_player",
        registeredAt: new Date(),
      },
    ],
  });
  signIn(player);

  expect(await getContestById(id)).toMatchObject({
    ok: true,
    data: { _id: id, isRegistered: true },
  });
});

it("allows a participant assigned directly to a contest room", async () => {
  const player = viewer();
  const { id } = await fixture({ status: "active" });
  await ContestRoom.create({
    contestId: id,
    name: "Read access match",
    status: "waiting",
    participants: [player.id],
  });
  signIn(player);

  expect(await getContestById(id)).toMatchObject({
    ok: true,
    data: { _id: id },
  });
});

it("recognizes the creator through their CP profile and checks revocation on every read", async () => {
  const { id, owner } = await fixture({
    spectatorRestriction: "admin_creator",
  });
  signIn(owner);

  expect(await getContestById(id)).toMatchObject({
    ok: true,
    data: { _id: id },
  });

  await ContestMatch.updateOne({ _id: id }, { spectatorRestriction: "none" });

  expect(await getContestById(id)).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
});

it.each([
  { restriction: "all" as const, user: viewer() },
  { restriction: "admin_creator" as const, user: viewer({ access: "Head" }) },
  {
    restriction: "club_members" as const,
    user: viewer({
      roles: [{ position: "Core Team", module: "Competitive Programming" }],
    }),
  },
])(
  "allows an eligible spectator under $restriction",
  async ({ restriction, user }) => {
    const { id } = await fixture({ spectatorRestriction: restriction });
    signIn(user);

    expect(await getContestById(id)).toMatchObject({
      ok: true,
      data: { _id: id },
    });
  },
);
