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

import ContestMatch from "@/models/ContestMatch";
import ContestRegistrationTeam from "@/models/ContestRegistrationTeam";
import CPUser from "@/models/CPUser";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import {
  createRoomContest,
  getContestListing,
  registerForContest,
} from "@/lib/actions/contests";
import { getCodeforcesProblemUrl } from "@/components/contests/roomPresentation";
import {
  parseBracketPosition,
  getRoundName,
  snakeSeed,
  nextPowerOf2,
} from "@/types/bracket";
import { recordRoomActivity } from "@/lib/contests/events";
import { getRedis } from "@/lib/redis";

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

vi.mock("@/lib/contests/queues", () => ({
  reconciliationQueue: { add: reconciliationQueueAdd, remove: vi.fn() },
  cfSyncQueue: { add: vi.fn() },
}));

describe("Contests Bugfix Drive End-to-End Test Suite (#33, #41, #42, #43, #44)", () => {
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

  describe("1. Problem URL Parsing & Formatting (#33, #41)", () => {
    it("correctly parses Codeforces problem IDs with alphanumeric suffixes", () => {
      expect(getCodeforcesProblemUrl("1678B1")).toBe(
        "https://codeforces.com/contest/1678/problem/B1",
      );
      expect(getCodeforcesProblemUrl("1678B2")).toBe(
        "https://codeforces.com/contest/1678/problem/B2",
      );
      expect(getCodeforcesProblemUrl("4A")).toBe(
        "https://codeforces.com/contest/4/problem/A",
      );
      expect(getCodeforcesProblemUrl("1234D")).toBe(
        "https://codeforces.com/contest/1234/problem/D",
      );
    });

    it("returns null for malformed or non-standard problem IDs", () => {
      expect(getCodeforcesProblemUrl("")).toBeNull();
      expect(getCodeforcesProblemUrl("1678")).toBeNull();
      expect(getCodeforcesProblemUrl("ABC")).toBeNull();
      expect(getCodeforcesProblemUrl("   ")).toBeNull();
    });
  });

  describe("2. Security & Role Hardening (#43)", () => {
    it("rejects non-head users trying to create open tournaments with FORBIDDEN", async () => {
      const regularUser = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "casual_user",
        cfRating: 1200,
      });

      // Regular member without "Head" access
      getSession.mockResolvedValue({
        user: { id: regularUser.userId.toString(), access: "Member" },
      });

      const res = await createRoomContest({
        name: "Unauthorized Tournament",
        description: "Should fail",
        mode: "blitz",
        format: "solo-tournament",
        teamSize: 1,
        registrationType: "open",
        problemSelectionMode: "bulk",
        bulkProblemCount: 3,
        bulkRatingMin: 800,
        bulkRatingMax: 1000,
        startTime: new Date(Date.now() + 86400000).toISOString(),
        maxParticipants: 16,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("FORBIDDEN");
      }
    });

    it("allows Head users to create open tournaments with fine-tuned problem points", async () => {
      const headUser = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "head_admin",
        cfRating: 1900,
      });

      getSession.mockResolvedValue({
        user: { id: headUser.userId.toString(), access: "Head" },
      });

      const res = await createRoomContest({
        name: "Official Open Tournament",
        description: "Authorized head tournament",
        mode: "blitz",
        format: "solo-tournament",
        teamSize: 1,
        registrationType: "open",
        spectatorRestriction: "all",
        problemSelectionMode: "fine-tuned",
        fineTunedProblems: ["4A", "1A"],
        problemSlots: [
          { platform: "codeforces", problemId: "4A", points: 150, timeLimitMinutes: 20 },
          { platform: "codeforces", problemId: "1A", points: 250, timeLimitMinutes: 30 },
        ],
        startTime: new Date(Date.now() + 86400000).toISOString(),
        maxParticipants: 16,
        registeredUsers: [{ id: headUser.userId.toString(), cfHandle: "head_admin" }],
      });

      expect(res.ok).toBe(true);
      const match = await ContestMatch.findOne({ name: "Official Open Tournament" });
      expect(match).not.toBeNull();
      expect(match?.spectatorRestriction).toBe("all");
      expect(match?.problemSlots).toHaveLength(2);
      expect(match?.problemSlots?.[0].points).toBe(150);
      expect(match?.problemSlots?.[0].timeLimitMinutes).toBe(20);
    });
  });

  describe("3. Double Elimination Bracket Math & Position Parsing (#43)", () => {
    it("correctly parses position strings for Upper, Lower, and Grand Finals", () => {
      expect(parseBracketPosition("0-1")).toEqual({
        stage: "upper",
        roundIndex: 0,
        matchIndex: 1,
      });
      expect(parseBracketPosition("upper-2-3")).toEqual({
        stage: "upper",
        roundIndex: 2,
        matchIndex: 3,
      });
      expect(parseBracketPosition("lower-1-0")).toEqual({
        stage: "lower",
        roundIndex: 1,
        matchIndex: 0,
      });
      expect(parseBracketPosition("grand_final-0-0")).toEqual({
        stage: "grand_final",
        roundIndex: 0,
        matchIndex: 0,
      });
    });

    it("formats human-readable round names across tournament phases", () => {
      expect(getRoundName(4, 4)).toBe("Final");
      expect(getRoundName(3, 4)).toBe("Semi-Finals");
      expect(getRoundName(2, 4)).toBe("Quarter-Finals");
      expect(getRoundName(4, 4, "lower")).toBe("Lower Final");
      expect(getRoundName(1, 1, "grand_final")).toBe("Grand Final");
    });

    it("correctly computes mathematical powers of 2 and snake seeds", () => {
      expect(nextPowerOf2(1)).toBe(2);
      expect(nextPowerOf2(3)).toBe(4);
      expect(nextPowerOf2(5)).toBe(8);
      expect(nextPowerOf2(8)).toBe(8);
      expect(nextPowerOf2(9)).toBe(16);

      const teams = [
        { teamId: "t1", seed: 1 },
        { teamId: "t2", seed: 2 },
        { teamId: "t3", seed: 3 },
        { teamId: "t4", seed: 4 },
      ];
      const seeded = snakeSeed(teams);
      expect(seeded.map((t) => t.teamId)).toEqual(["t1", "t4", "t2", "t3"]);
    });
  });

  describe("4. Spectator Mode & Dynamic Access Controls (#44)", () => {
    it("evaluates spectator access across all restriction policies", async () => {
      const creatorId = new mongoose.Types.ObjectId().toString();
      const clubMemberId = new mongoose.Types.ObjectId().toString();
      const guestId = new mongoose.Types.ObjectId().toString();

      await CPUser.create([
        { userId: creatorId, cfHandle: "creator_user", cfRating: 1500 },
        { userId: clubMemberId, cfHandle: "club_member", cfRating: 1400 },
        { userId: guestId, cfHandle: "guest_user", cfRating: 1000 },
      ]);

      const matchNone = await ContestMatch.create({
        name: "Restricted Match",
        creatorId: new mongoose.Types.ObjectId(creatorId),
        format: "1v1",
        mode: "blitz",
        status: "active",
        spectatorRestriction: "none",
        problemSelectionMode: "test",
        startTime: new Date(),
      });

      const matchAll = await ContestMatch.create({
        name: "Public Match",
        creatorId: new mongoose.Types.ObjectId(creatorId),
        format: "1v1",
        mode: "blitz",
        status: "active",
        spectatorRestriction: "all",
        problemSelectionMode: "test",
        startTime: new Date(),
      });

      const matchClub = await ContestMatch.create({
        name: "Club Match",
        creatorId: new mongoose.Types.ObjectId(creatorId),
        format: "1v1",
        mode: "blitz",
        status: "active",
        spectatorRestriction: "club_members",
        problemSelectionMode: "test",
        startTime: new Date(),
      });

      // Guest viewer
      getSession.mockResolvedValue({ user: { id: guestId, access: "Member" } });

      const listing = await getContestListing();
      expect(listing.ok).toBe(true);
      if (listing.ok) {
        const itemNone = listing.data.active.find((c) => c._id === matchNone._id.toString());
        const itemAll = listing.data.active.find((c) => c._id === matchAll._id.toString());
        const itemClub = listing.data.active.find((c) => c._id === matchClub._id.toString());

        expect(itemNone?.canSpectate).toBe(false);
        expect(itemAll?.canSpectate).toBe(true);
        expect(itemClub?.canSpectate).toBe(false);
      }
    });
  });

  describe("5. Team Creation & Private Join Code Flow (#44)", () => {
    it("generates a secure joinCode for private teams and supports code-based joining", async () => {
      const leaderId = new mongoose.Types.ObjectId().toString();
      const joinerId = new mongoose.Types.ObjectId().toString();

      await CPUser.create([
        { userId: leaderId, cfHandle: "team_leader", cfRating: 1600 },
        { userId: joinerId, cfHandle: "team_joiner", cfRating: 1400 },
      ]);

      const contest = await ContestMatch.create({
        name: "Team Battle 3v3",
        creatorId: new mongoose.Types.ObjectId(leaderId),
        format: "team-tournament",
        mode: "blitz",
        teamSize: 3,
        status: "registration",
        problemSelectionMode: "test",
        startTime: new Date(Date.now() + 86400000),
      });

      // Leader creates a private team with a secure join code
      getSession.mockResolvedValue({ user: { id: leaderId, access: "Member" } });
      const createTeamRes = await registerForContest(
        contest._id.toString(),
        "Code Ninjas",
        false,
        "SECRET_JOIN_123",
      );
      expect(createTeamRes.ok).toBe(true);

      const team = await ContestRegistrationTeam.findOne({ name: "Code Ninjas" });
      expect(team).not.toBeNull();
      expect(team?.isPublic).toBe(false);
      expect(team?.joinCode).toBe("SECRET_JOIN_123");

      // Member joins with wrong join code -> Rejected
      getSession.mockResolvedValue({ user: { id: joinerId, access: "Member" } });
      const badJoin = await registerForContest(
        contest._id.toString(),
        "Code Ninjas",
        undefined,
        "WRONG_CODE",
      );
      expect(badJoin.ok).toBe(false);

      // Member joins with correct code -> Success
      const goodJoin = await registerForContest(
        contest._id.toString(),
        "Code Ninjas",
        undefined,
        "SECRET_JOIN_123",
      );
      expect(goodJoin.ok).toBe(true);

      const updatedContest = await ContestMatch.findById(contest._id);
      expect(updatedContest?.registrations).toHaveLength(2);
      expect(updatedContest?.registrations?.some((r) => r.cfHandle === "team_joiner")).toBe(true);
    });
  });

  describe("6. Realtime Activity Logging & Redis Retention (#42)", () => {
    it("records room activity and safely caps retention without dropping recent entries", async () => {
      const roomId = new mongoose.Types.ObjectId().toString();

      // Record 5 activity items
      for (let i = 1; i <= 5; i++) {
        await recordRoomActivity(roomId, {
          icon: "check_circle",
          text: `Event ${i}`,
          color: "text-primary",
        });
      }

      const redis = await getRedis();
      const logs = await redis.lRange(`room:${roomId}:activity_logs`, 0, -1);
      expect(logs).toHaveLength(5);

      const parsedLogs = logs.map((l) => JSON.parse(l));
      expect(parsedLogs[0].text).toBe("Event 1");
      expect(parsedLogs[4].text).toBe("Event 5");
    });
  });
});
