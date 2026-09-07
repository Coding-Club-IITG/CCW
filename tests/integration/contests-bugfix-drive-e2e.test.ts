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
  createBracketContest,
  getContestListing,
  registerForContest,
} from "@/lib/actions/contests";
import { createBracketContest as createAdminBracketContest } from "@/lib/actions/admin/contests";
import {
  getCodeforcesProblemUrl,
  formatRemainingTime,
  formatRoomActivityTime,
  getDisplayTeamName,
  getContestRoomResultsPath,
} from "@/components/contests/roomPresentation";
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
    it("allows regular members to create solo tournaments and 3v3 team battles", async () => {
      const regularUser = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "casual_tourney_user",
        cfRating: 1200,
      });

      getSession.mockResolvedValue({
        user: { id: regularUser.userId.toString(), access: "Member" },
      });

      const soloRes = await createRoomContest({
        name: "Casual Solo Tourney",
        description: "Regular member open tournament",
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

      expect(soloRes.ok).toBe(true);

      const teamRes = await createRoomContest({
        name: "Casual 3v3 Battle",
        description: "Regular member 3v3 battle",
        mode: "arena",
        format: "team-tournament",
        teamSize: 3,
        registrationType: "open",
        problemSelectionMode: "bulk",
        bulkProblemCount: 3,
        bulkRatingMin: 800,
        bulkRatingMax: 1200,
        startTime: new Date(Date.now() + 86400000).toISOString(),
        maxParticipants: 6,
      });

      expect(teamRes.ok).toBe(true);
    });

    it("allows regular members to create knockout tournaments with up to 8 participants", async () => {
      const regularUser = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "casual_bracket_user",
        cfRating: 1300,
      });

      getSession.mockResolvedValue({
        user: { id: regularUser.userId.toString(), access: "Member" },
      });

      const p2 = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "casual_p2",
        cfRating: 1350,
      });

      const res = await createBracketContest({
        name: "Casual 8-player Bracket",
        mode: "blitz",
        teamSize: 1,
        maxParticipants: 8,
        registrationType: "closed",
        problemSelectionMode: "bulk",
        bulkRatingMin: 800,
        bulkRatingMax: 1200,
        bulkProblemCount: 3,
        seedingMethod: "cf_rating",
        startTime: new Date(Date.now() + 86400000).toISOString(),
        registeredUsers: [
          { id: regularUser.userId.toString(), cfHandle: "casual_bracket_user" },
          { id: p2.userId.toString(), cfHandle: "casual_p2" },
        ],
      });

      expect(res.ok).toBe(true);
    });

    it("rejects non-head users trying to create knockout tournaments with >8 members with FORBIDDEN", async () => {
      const regularUser = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "casual_big_bracket_user",
        cfRating: 1200,
      });

      getSession.mockResolvedValue({
        user: { id: regularUser.userId.toString(), access: "Member" },
      });

      // Via createBracketContest
      const bracketRes = await createBracketContest({
        name: "Unauthorized 16-player Bracket",
        mode: "blitz",
        teamSize: 1,
        maxParticipants: 16,
        registrationType: "open",
        problemSelectionMode: "bulk",
        seedingMethod: "cf_rating",
        startTime: new Date(Date.now() + 86400000).toISOString(),
        registeredUsers: [],
      });

      expect(bracketRes.ok).toBe(false);
      if (!bracketRes.ok) {
        expect(bracketRes.error.code).toBe("FORBIDDEN");
        expect(bracketRes.error.message).toContain("8 participants");
      }

      // Via createRoomContest with format: "bracket"
      const roomRes = await createRoomContest({
        name: "Unauthorized 16-player Room Bracket",
        mode: "blitz",
        format: "bracket",
        teamSize: 1,
        maxParticipants: 16,
        registrationType: "open",
        problemSelectionMode: "bulk",
        startTime: new Date(Date.now() + 86400000).toISOString(),
      });

      expect(roomRes.ok).toBe(false);
      if (!roomRes.ok) {
        expect(roomRes.error.code).toBe("FORBIDDEN");
        expect(roomRes.error.message).toContain("8 participants");
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

  describe("7. Dynamic Start Time Buffer & Validation Rules (#33)", () => {
    it("rejects casual 1v1 creation when start time is less than 55s in the future", async () => {
      const user = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "fast_creator",
        cfRating: 1500,
      });

      getSession.mockResolvedValue({
        user: { id: user.userId.toString(), access: "Member" },
      });

      // Start time only 20 seconds in the future
      const invalidStart = new Date(Date.now() + 20 * 1000).toISOString();

      const res = await createRoomContest({
        name: "Too Fast 1v1",
        description: "Should fail buffer check",
        mode: "blitz",
        format: "1v1",
        teamSize: 1,
        maxParticipants: 2,
        registrationType: "closed",
        problemSelectionMode: "test",
        startTime: invalidStart,
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("VALIDATION_ERROR");
        expect(res.error.message).toContain("1 minute");
      }
    });

    it("accepts casual 1v1 creation with +2 min buffer and sets closed registration", async () => {
      const user = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "valid_creator",
        cfRating: 1500,
      });

      getSession.mockResolvedValue({
        user: { id: user.userId.toString(), access: "Member" },
      });

      // 2 minutes in the future (safely > 55s)
      const validStart = new Date(Date.now() + 120 * 1000).toISOString();

      const res = await createRoomContest({
        name: "Valid 1v1 Match",
        description: "Testing buffer pass",
        mode: "blitz",
        format: "1v1",
        teamSize: 1,
        maxParticipants: 2,
        registrationType: "closed",
        problemSelectionMode: "test",
        startTime: validStart,
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        const created = await ContestMatch.findOne({ name: "Valid 1v1 Match" });
        expect(created).not.toBeNull();
        expect(created?.teamSize).toBe(1);
        expect(created?.registrationSettings?.maxParticipants).toBe(2);
        expect(created?.registrationSettings?.type).toBe("closed");
      }
    });

    it("rejects 'test' problem selection mode in production environment across room and bracket endpoints", async () => {
      const originalEnv = process.env.NODE_ENV;
      (process.env as Record<string, string | undefined>).NODE_ENV =
        "production";
      try {
        const user = await CPUser.create({
          userId: new mongoose.Types.ObjectId(),
          cfHandle: "prod_creator",
          cfRating: 1500,
        });

        getSession.mockResolvedValue({
          user: { id: user.userId.toString(), access: "Member" },
        });

        const res = await createRoomContest({
          name: "Prod Test Mode Match",
          description: "Should fail in production",
          mode: "blitz",
          format: "1v1",
          teamSize: 1,
          maxParticipants: 2,
          registrationType: "closed",
          problemSelectionMode: "test",
          startTime: new Date(Date.now() + 120 * 1000).toISOString(),
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.error.code).toBe("VALIDATION_ERROR");
          expect(res.error.message).toContain(
            "Problem selection mode must be 'bulk' or 'fine-tuned'.",
          );
        }

        const bracketRes = await createBracketContest({
          name: "Prod Bracket Test Mode",
          mode: "blitz",
          teamSize: 1,
          startTime: new Date(Date.now() + 600000).toISOString(),
          registrationType: "closed",
          maxParticipants: 4,
          presetId: "custom",
          problemSelectionMode: "test",
          seedingMethod: "cf_rating",
          registeredUsers: [],
        });

        expect(bracketRes.ok).toBe(false);
        if (!bracketRes.ok) {
          expect(bracketRes.error.code).toBe("VALIDATION_ERROR");
          expect(bracketRes.error.message).toContain(
            "Problem selection mode must be 'bulk' or 'fine-tuned'.",
          );
        }

        getSession.mockResolvedValue({
          user: { id: user.userId.toString(), access: "Head" },
        });

        const adminBracketRes = await createAdminBracketContest({
          name: "Prod Admin Bracket Test Mode",
          mode: "blitz",
          teamSize: 1,
          startTime: new Date(Date.now() + 600000).toISOString(),
          registrationType: "closed",
          maxParticipants: 4,
          presetId: "custom",
          problemSelectionMode: "test",
          seedingMethod: "cf_rating",
          registeredUsers: [],
        });

        expect(adminBracketRes.ok).toBe(false);
        if (!adminBracketRes.ok) {
          expect(adminBracketRes.error.code).toBe("VALIDATION_ERROR");
          expect(adminBracketRes.error.message).toContain(
            "Problem selection mode must be 'bulk' or 'fine-tuned'.",
          );
        }
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV =
          originalEnv;
      }
    });
  });

  describe("8. Room Presentation & Time Formatting Utilities (#33, #42, #44)", () => {
    it("formats remaining seconds into MM:SS correctly", () => {
      expect(formatRemainingTime(0)).toBe("00:00");
      expect(formatRemainingTime(-10)).toBe("00:00");
      expect(formatRemainingTime(9)).toBe("00:09");
      expect(formatRemainingTime(59)).toBe("00:59");
      expect(formatRemainingTime(65)).toBe("01:05");
      expect(formatRemainingTime(725)).toBe("12:05");
      expect(formatRemainingTime(3600)).toBe("60:00");
    });

    it("formats room activity relative timestamps accurately", () => {
      const now = 1700000000000;
      expect(formatRoomActivityTime(now - 2000, now)).toBe("just now");
      expect(formatRoomActivityTime(now - 30000, now)).toBe("30s ago");
      expect(formatRoomActivityTime(now - 120000, now)).toBe("2m ago");
      expect(formatRoomActivityTime(now - 3600000, now)).toBe("1h ago");
      expect(formatRoomActivityTime(now - 7200000, now)).toBe("2h ago");
    });

    it("resolves solo and team display names with pizza counts appropriately", () => {
      const soloTeam = {
        _id: "team_1",
        name: "Solo Alpha",
        score: 0,
        isLeader: true,
        members: [
          {
            id: "u1",
            name: "Alice",
            pizza_count: 5,
            handle: "alice_cf",
            avatar: null,
          },
        ],
      };

      const groupTeam = {
        _id: "team_2",
        name: "Byte Bandits",
        score: 0,
        isLeader: true,
        members: [
          {
            id: "u2",
            name: "Bob",
            pizza_count: 0,
            handle: "bob_cf",
            avatar: null,
          },
          {
            id: "u3",
            name: "Charlie",
            pizza_count: 2,
            handle: "charlie_cf",
            avatar: null,
          },
        ],
      };

      // In 1v1 or solo-tournament, solo team uses user's display name
      expect(getDisplayTeamName(soloTeam, "1v1")).toContain("Alice");
      expect(getDisplayTeamName(soloTeam, "solo-tournament")).toContain("Alice");

      // In team tournaments, team name is used
      expect(getDisplayTeamName(groupTeam, "team-tournament")).toBe("Byte Bandits");

      // Undefined team returns "Unknown"
      expect(getDisplayTeamName(undefined)).toBe("Unknown");
    });

    it("generates correct contest room results paths with bracket flag support", () => {
      expect(getContestRoomResultsPath("room_abc")).toBe(
        "/internal/contests/rooms/room_abc/result",
      );
      expect(getContestRoomResultsPath("room_abc", "bracket")).toBe(
        "/internal/contests/rooms/room_abc/result?from=bracket",
      );
      expect(getContestRoomResultsPath("room_abc", "1v1", "knockout")).toBe(
        "/internal/contests/rooms/room_abc/result?from=bracket",
      );
    });
  });

  describe("9. Double Elimination Bracket Math & Seeding Invariants (#43)", () => {
    it("computes next power of 2 correctly for various bracket participant counts", () => {
      expect(nextPowerOf2(0)).toBe(2);
      expect(nextPowerOf2(1)).toBe(2);
      expect(nextPowerOf2(2)).toBe(2);
      expect(nextPowerOf2(3)).toBe(4);
      expect(nextPowerOf2(4)).toBe(4);
      expect(nextPowerOf2(7)).toBe(8);
      expect(nextPowerOf2(8)).toBe(8);
      expect(nextPowerOf2(9)).toBe(16);
      expect(nextPowerOf2(16)).toBe(16);
      expect(nextPowerOf2(17)).toBe(32);
    });

    it("generates deterministic snake seeding with balanced pairings", () => {
      const teams = [
        { teamId: "team_1", seed: 1 },
        { teamId: "team_2", seed: 2 },
        { teamId: "team_3", seed: 3 },
        { teamId: "team_4", seed: 4 },
      ];
      const seeded = snakeSeed(teams);
      expect(seeded).toHaveLength(4);
      expect(seeded.map((t) => t.seed)).toEqual([1, 4, 2, 3]);
    });

    it("returns correct human-readable round names across upper, lower, and grand final rounds", () => {
      expect(getRoundName(1, 4, "upper")).toBe("Round of 16");
      expect(getRoundName(2, 4, "upper")).toBe("Quarter-Finals");
      expect(getRoundName(3, 4, "upper")).toBe("Semi-Finals");
      expect(getRoundName(4, 4, "upper")).toBe("Final");

      expect(getRoundName(1, 6, "lower")).toBe("Lower Round 1");
      expect(getRoundName(5, 6, "lower")).toBe("Lower Semi-Finals");
      expect(getRoundName(6, 6, "lower")).toBe("Lower Final");

      expect(getRoundName(1, 1, "grand_final")).toBe("Grand Final");
    });
  });
});
