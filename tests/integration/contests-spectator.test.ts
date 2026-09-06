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

import ContestMatch from "@/models/ContestMatch";
import CPUser from "@/models/CPUser";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import {
  getContestListing,
  createRoomContest,
  createBracketContest,
} from "@/lib/actions/contests";

const getSession = vi.hoisted(() => vi.fn());
const reconciliationQueueAdd = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession } },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  default: vi.fn(async () => mongoose),
  dbConnect: vi.fn(async () => mongoose),
}));

// Mock the BullMQ queues to prevent Redis connections in tests
vi.mock("@/lib/contests/queues", () => ({
  reconciliationQueue: { add: reconciliationQueueAdd },
  cfSyncQueue: { add: vi.fn() },
}));
vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(),
}));

describe("Spectator Mode", () => {
  beforeAll(async () => {
    await startTestMongo();
  });

  afterEach(async () => {
    await clearTestMongo();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await stopTestMongo();
  });

  describe("Contest Creation", () => {
    it("should save spectatorRestriction in createRoomContest", async () => {
      const cpUser = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "tester",
        cfRating: 1500
      });
      getSession.mockResolvedValue({ user: { id: cpUser.userId.toString() } });

      const res = await createRoomContest({
        name: "Test Room",
        description: "Test Desc",
        mode: "blitz",
        teamSize: 1,
        spectatorRestriction: "club_members",
        problemSelectionMode: "bulk",
        bulkProblemCount: 3,
        bulkRatingMin: 800,
        bulkRatingMax: 1000,
        problemSlots: [],
        startTime: new Date(Date.now() + 86400000).toISOString(),
        registrationType: "open",
        maxParticipants: 10,
        registeredUsers: [{ id: cpUser.userId.toString(), cfHandle: "tester" }],
      });

      expect(res.ok).toBe(true);
      const contest = await ContestMatch.findOne({ name: "Test Room" });
      expect((contest as any).spectatorRestriction).toBe("club_members");
    });

    it("should save spectatorRestriction in createBracketContest", async () => {
      const cpUser = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "tester2",
        cfRating: 1500
      });
      getSession.mockResolvedValue({ user: { id: cpUser.userId.toString() } });

      const res = await createBracketContest({
        name: "Bracket Room",
        description: "Test Desc",
        mode: "blitz",
        teamSize: 1,
        spectatorRestriction: "all",
        problemSelectionMode: "bulk",
        bulkProblemCount: 3,
        bulkRatingMin: 800,
        bulkRatingMax: 1000,
        problemSlots: [],
        startTime: new Date(Date.now() + 86400000).toISOString(),
        registrationType: "open",
        maxParticipants: 16,
      });

      expect(res.ok).toBe(true);
      const contest = await ContestMatch.findById(((res as any).data as any).contestId);
      expect((contest as any).spectatorRestriction).toBe("all");
    });
  });

  describe("canSpectate logic in getContestListing", () => {
    let creatorId: string;
    let otherId: string;

    beforeEach(async () => {
      creatorId = new mongoose.Types.ObjectId().toString();
      otherId = new mongoose.Types.ObjectId().toString();

      await CPUser.create([
        { userId: creatorId, cfHandle: "creator", cfRating: 1000 },
        { userId: otherId, cfHandle: "other", cfRating: 1000 },
      ]);
    });

    const createDummyContest = async (restriction: string) => {
      return await ContestMatch.create({
        name: "Test Contest",
        format: "1v1",
        mode: "blitz",
        status: "active",
        creatorId: creatorId,
        teamSize: 1,
        spectatorRestriction: restriction as any,
        problemSelectionMode: "bulk",
        bulkPlatform: "codeforces",
      });
    };

    it("should return canSpectate = false when restriction is none", async () => {
      await createDummyContest("none");
      
      getSession.mockResolvedValue({ user: { id: creatorId, access: "Head" } });
      let res = await getContestListing();
      expect(res.ok).toBe(true);
      expect(((res as any).data as any).active[0].canSpectate).toBe(false);

      getSession.mockResolvedValue({ user: { id: otherId } });
      res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(false);
    });

    it("should return canSpectate = true for any authenticated user when restriction is all", async () => {
      await createDummyContest("all");
      
      getSession.mockResolvedValue({ user: { id: otherId } });
      let res = await getContestListing();
      expect(res.ok).toBe(true);
      expect(((res as any).data as any).active[0].canSpectate).toBe(true);
      
      getSession.mockResolvedValue(null);
      res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(true); 
    });

    it("should return canSpectate = true for club_members, admins, or creator when restriction is club_members", async () => {
      await createDummyContest("club_members");
      
      getSession.mockResolvedValue({ user: { id: otherId } });
      let res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(false);

      getSession.mockResolvedValue({ user: { id: otherId, roles: [{ position: "Core Team", module: "Competitive Programming" }] } });
      res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(true);

      getSession.mockResolvedValue({ user: { id: creatorId } });
      res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(true);

      getSession.mockResolvedValue({ user: { id: otherId, access: "Head" } });
      res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(true);
    });

    it("should return canSpectate = true for admins or creator only when restriction is admin_creator", async () => {
      await createDummyContest("admin_creator");
      
      getSession.mockResolvedValue({ user: { id: otherId } });
      let res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(false);

      getSession.mockResolvedValue({ user: { id: otherId, roles: [{ position: "Core Team", module: "Competitive Programming" }] } });
      res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(false);

      getSession.mockResolvedValue({ user: { id: creatorId } });
      res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(true);

      getSession.mockResolvedValue({ user: { id: otherId, access: "Head" } });
      res = await getContestListing();
      expect(((res as any).data as any).active[0].canSpectate).toBe(true);
    });
  });
});

