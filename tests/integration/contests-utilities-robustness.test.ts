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
} from "@/lib/actions/contests";
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
import { webEnv } from "@/lib/env/web";

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

describe("Comprehensive Utilities & Robustness Test Suite (#33, #41, #42, #43, #44)", () => {
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

  describe("1. Problem URL Parsing & Formatting Robustness (#33, #41)", () => {
    it("handles diverse Codeforces problem IDs and partitions correctly", () => {
      expect(getCodeforcesProblemUrl("1A")).toBe(
        "https://codeforces.com/contest/1/problem/A",
      );
      expect(getCodeforcesProblemUrl("1234D")).toBe(
        "https://codeforces.com/contest/1234/problem/D",
      );
      expect(getCodeforcesProblemUrl("1678B1")).toBe(
        "https://codeforces.com/contest/1678/problem/B1",
      );
      expect(getCodeforcesProblemUrl("1678B2")).toBe(
        "https://codeforces.com/contest/1678/problem/B2",
      );
      expect(getCodeforcesProblemUrl("2000C3")).toBe(
        "https://codeforces.com/contest/2000/problem/C3",
      );
    });

    it("returns null safely for invalid, empty, or non-conforming problem IDs", () => {
      expect(getCodeforcesProblemUrl("")).toBeNull();
      expect(getCodeforcesProblemUrl("   ")).toBeNull();
      expect(getCodeforcesProblemUrl("ABC")).toBeNull();
      expect(getCodeforcesProblemUrl("12345")).toBeNull();
      expect(getCodeforcesProblemUrl(undefined as unknown as string)).toBeNull();
    });
  });

  describe("2. Room Presentation & Time Formatting Utilities (#33, #42, #44)", () => {
    it("formats remaining seconds into MM:SS correctly with boundary and negative clamp", () => {
      expect(formatRemainingTime(0)).toBe("00:00");
      expect(formatRemainingTime(-5)).toBe("00:00");
      expect(formatRemainingTime(-999)).toBe("00:00");
      expect(formatRemainingTime(7)).toBe("00:07");
      expect(formatRemainingTime(59)).toBe("00:59");
      expect(formatRemainingTime(60)).toBe("01:00");
      expect(formatRemainingTime(75)).toBe("01:15");
      expect(formatRemainingTime(3599)).toBe("59:59");
      expect(formatRemainingTime(3600)).toBe("60:00");
      expect(formatRemainingTime(7200)).toBe("120:00");
    });

    it("formats activity relative time across seconds, minutes, hours, and days", () => {
      const now = 1700000000000;
      expect(formatRoomActivityTime(now - 1000, now)).toBe("just now");
      expect(formatRoomActivityTime(now - 4000, now)).toBe("just now");
      expect(formatRoomActivityTime(now - 15000, now)).toBe("15s ago");
      expect(formatRoomActivityTime(now - 59000, now)).toBe("59s ago");
      expect(formatRoomActivityTime(now - 60000, now)).toBe("1m ago");
      expect(formatRoomActivityTime(now - 150000, now)).toBe("2m ago");
      expect(formatRoomActivityTime(now - 3600000, now)).toBe("1h ago");
      expect(formatRoomActivityTime(now - 7200000, now)).toBe("2h ago");
      expect(formatRoomActivityTime(now - 86400000, now)).toBe("1d ago");
      expect(formatRoomActivityTime(now - 172800000, now)).toBe("2d ago");
    });

    it("resolves team display names correctly for solo, team, and missing members", () => {
      const soloWithPizza = {
        _id: "team_solo",
        name: "Solo Team",
        score: 100,
        isLeader: true,
        members: [
          {
            id: "u1",
            name: "Alice Bob",
            pizza_count: 4,
            handle: "alice_cf",
            avatar: null,
          },
        ],
      };

      const soloWithoutPizza = {
        _id: "team_solo2",
        name: "Solo Team 2",
        score: 50,
        isLeader: true,
        members: [
          {
            id: "u2",
            name: "Charlie",
            pizza_count: 0,
            handle: "charlie_cf",
            avatar: null,
          },
        ],
      };

      const groupTeam = {
        _id: "team_group",
        name: "The Algorithms",
        score: 300,
        isLeader: true,
        members: [
          { id: "u3", name: "David", pizza_count: 2, handle: "david_cf", avatar: null },
          { id: "u4", name: "Eve", pizza_count: 1, handle: "eve_cf", avatar: null },
        ],
      };

      // 1v1 and solo-tournament use member display name
      expect(getDisplayTeamName(soloWithPizza, "1v1")).toContain("Alice");
      expect(getDisplayTeamName(soloWithPizza, "solo-tournament")).toContain("Alice");
      expect(getDisplayTeamName(soloWithoutPizza, "1v1")).toContain("Charlie");

      // Team battles and team tournaments use team name
      expect(getDisplayTeamName(groupTeam, "team-tournament")).toBe("The Algorithms");
      expect(getDisplayTeamName(groupTeam, "arena")).toBe("The Algorithms");

      // Undefined team returns "Unknown"
      expect(getDisplayTeamName(undefined)).toBe("Unknown");
    });

    it("generates correct contest room results paths with query preservation", () => {
      expect(getContestRoomResultsPath("room_1")).toBe(
        "/internal/contests/rooms/room_1/result",
      );
      expect(getContestRoomResultsPath("room_1", "bracket")).toBe(
        "/internal/contests/rooms/room_1/result?from=bracket",
      );
      expect(getContestRoomResultsPath("room_1", "1v1", "knockout")).toBe(
        "/internal/contests/rooms/room_1/result?from=bracket",
      );
      expect(getContestRoomResultsPath("room_2", "team-tournament", "swiss")).toBe(
        "/internal/contests/rooms/room_2/result",
      );
    });
  });

  describe("3. Double Elimination Bracket Math, Seeding, and Position Parsing (#43)", () => {
    it("computes nextPowerOf2 correctly for edge and standard participant counts", () => {
      expect(nextPowerOf2(0)).toBe(2);
      expect(nextPowerOf2(1)).toBe(2);
      expect(nextPowerOf2(2)).toBe(2);
      expect(nextPowerOf2(3)).toBe(4);
      expect(nextPowerOf2(4)).toBe(4);
      expect(nextPowerOf2(5)).toBe(8);
      expect(nextPowerOf2(8)).toBe(8);
      expect(nextPowerOf2(9)).toBe(16);
      expect(nextPowerOf2(16)).toBe(16);
      expect(nextPowerOf2(31)).toBe(32);
      expect(nextPowerOf2(32)).toBe(32);
    });

    it("performs deterministic snake seeding for 2, 4, and 8 teams", () => {
      const twoTeams = [
        { teamId: "t1", seed: 1 },
        { teamId: "t2", seed: 2 },
      ];
      expect(snakeSeed(twoTeams).map((t) => t.seed)).toEqual([1, 2]);

      const fourTeams = [
        { teamId: "t1", seed: 1 },
        { teamId: "t2", seed: 2 },
        { teamId: "t3", seed: 3 },
        { teamId: "t4", seed: 4 },
      ];
      expect(snakeSeed(fourTeams).map((t) => t.seed)).toEqual([1, 4, 2, 3]);

      const eightTeams = [
        { teamId: "t1", seed: 1 },
        { teamId: "t2", seed: 2 },
        { teamId: "t3", seed: 3 },
        { teamId: "t4", seed: 4 },
        { teamId: "t5", seed: 5 },
        { teamId: "t6", seed: 6 },
        { teamId: "t7", seed: 7 },
        { teamId: "t8", seed: 8 },
      ];
      expect(snakeSeed(eightTeams).map((t) => t.seed)).toEqual([
        1, 8, 2, 7, 3, 6, 4, 5,
      ]);
    });

    it("parses bracket positions correctly across legacy and modern formats", () => {
      expect(parseBracketPosition("0-0")).toEqual({
        stage: "upper",
        roundIndex: 0,
        matchIndex: 0,
      });
      expect(parseBracketPosition("upper-2-1")).toEqual({
        stage: "upper",
        roundIndex: 2,
        matchIndex: 1,
      });
      expect(parseBracketPosition("lower-1-3")).toEqual({
        stage: "lower",
        roundIndex: 1,
        matchIndex: 3,
      });
      expect(parseBracketPosition("grand_final-0-0")).toEqual({
        stage: "grand_final",
        roundIndex: 0,
        matchIndex: 0,
      });
    });

    it("returns correct human-readable round names across single and double elimination stages", () => {
      // Single elimination / default upper
      expect(getRoundName(1, 3)).toBe("Quarter-Finals");
      expect(getRoundName(2, 3)).toBe("Semi-Finals");
      expect(getRoundName(3, 3)).toBe("Final");

      // Upper stage
      expect(getRoundName(1, 4, "upper")).toBe("Round of 16");
      expect(getRoundName(2, 4, "upper")).toBe("Quarter-Finals");
      expect(getRoundName(3, 4, "upper")).toBe("Semi-Finals");
      expect(getRoundName(4, 4, "upper")).toBe("Final");

      // Lower stage
      expect(getRoundName(1, 4, "lower")).toBe("Lower Round 1");
      expect(getRoundName(2, 4, "lower")).toBe("Lower Round 2");
      expect(getRoundName(3, 4, "lower")).toBe("Lower Semi-Finals");
      expect(getRoundName(4, 4, "lower")).toBe("Lower Final");

      // Grand final stage
      expect(getRoundName(1, 1, "grand_final")).toBe("Grand Final");
    });
  });

  describe("4. Spectator Authorization with CPUser._id vs User._id Resolution (#44)", () => {
    it("correctly recognizes contest creator when creatorId holds CPUser._id", async () => {
      const creatorUserId = new mongoose.Types.ObjectId();
      const creatorCpUser = await CPUser.create({
        userId: creatorUserId,
        cfHandle: "creator_cf",
        cfRating: 1600,
        cfVerified: true,
      });

      const viewerUserId = new mongoose.Types.ObjectId();
      await CPUser.create({
        userId: viewerUserId,
        cfHandle: "viewer_cf",
        cfRating: 1200,
        cfVerified: true,
      });

      // Contest created with creatorId pointing to creatorCpUser._id (standard CCW model)
      const contest = await ContestMatch.create({
        name: "Creator Spectate Test",
        creatorId: creatorCpUser._id,
        format: "1v1",
        mode: "blitz",
        status: "active",
        spectatorRestriction: "admin_creator",
        problemSelectionMode: "bulk",
        bulkPlatform: "codeforces",
      });

      // 1. Logged in as creator (regular Member, NOT Head/Admin)
      getSession.mockResolvedValue({
        user: { id: creatorUserId.toString(), access: "Member" },
      });

      const creatorListing = await getContestListing();
      expect(creatorListing.ok).toBe(true);
      if (creatorListing.ok) {
        const item = creatorListing.data.active.find(
          (c) => c._id === contest._id.toString(),
        );
        expect(item).toBeDefined();
        // Creator should be authorized to spectate their own contest!
        expect(item?.canSpectate).toBe(true);
      }

      // 2. Logged in as non-creator regular Member
      getSession.mockResolvedValue({
        user: { id: viewerUserId.toString(), access: "Member" },
      });

      const viewerListing = await getContestListing();
      expect(viewerListing.ok).toBe(true);
      if (viewerListing.ok) {
        const item = viewerListing.data.active.find(
          (c) => c._id === contest._id.toString(),
        );
        expect(item).toBeDefined();
        // Non-creator regular member is denied under admin_creator restriction
        expect(item?.canSpectate).toBe(false);
      }
    });
  });

  describe("5. Start Time Buffer & 5-Second Network Grace Window (#33, #43)", () => {
    it("permits bracket contest creation when start time is within the 5s grace tolerance", async () => {
      const user = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "grace_user",
        cfRating: 1400,
        cfVerified: true,
      });

      const user2 = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "grace_user_2",
        cfRating: 1350,
        cfVerified: true,
      });

      getSession.mockResolvedValue({
        user: { id: user.userId.toString(), access: "Member" },
      });

      const deadlineMinutes = webEnv.REGISTRATION_DEADLINE_MINUTES;
      // Start time exactly (deadline + 1) minutes in future minus 2 seconds (within 5s grace window)
      const validGraceTime = new Date(
        Date.now() + (deadlineMinutes + 1) * 60000 - 2000,
      ).toISOString();

      const res = await createBracketContest({
        name: "Grace Tolerance Bracket",
        mode: "blitz",
        teamSize: 1,
        maxParticipants: 8,
        registrationType: "closed",
        problemSelectionMode: "bulk",
        bulkRatingMin: 800,
        bulkRatingMax: 1200,
        bulkProblemCount: 3,
        seedingMethod: "cf_rating",
        startTime: validGraceTime,
        registeredUsers: [
          { id: user.userId.toString(), cfHandle: "grace_user" },
          { id: user2.userId.toString(), cfHandle: "grace_user_2" },
        ],
      });

      expect(res.ok).toBe(true);
    });

    it("rejects bracket contest creation when start time is outside the 5s grace tolerance", async () => {
      const user = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "late_user",
        cfRating: 1400,
        cfVerified: true,
      });

      const user2 = await CPUser.create({
        userId: new mongoose.Types.ObjectId(),
        cfHandle: "late_user_2",
        cfRating: 1350,
        cfVerified: true,
      });

      getSession.mockResolvedValue({
        user: { id: user.userId.toString(), access: "Member" },
      });

      const deadlineMinutes = webEnv.REGISTRATION_DEADLINE_MINUTES;
      // Start time 15 seconds too early (outside 5s grace window)
      const lateTime = new Date(
        Date.now() + (deadlineMinutes + 1) * 60000 - 15000,
      ).toISOString();

      const res = await createBracketContest({
        name: "Late Bracket",
        mode: "blitz",
        teamSize: 1,
        maxParticipants: 8,
        registrationType: "closed",
        problemSelectionMode: "bulk",
        bulkRatingMin: 800,
        bulkRatingMax: 1200,
        bulkProblemCount: 3,
        seedingMethod: "cf_rating",
        startTime: lateTime,
        registeredUsers: [
          { id: user.userId.toString(), cfHandle: "late_user" },
          { id: user2.userId.toString(), cfHandle: "late_user_2" },
        ],
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("VALIDATION_ERROR");
        expect(res.error.message).toContain("Start time must be at least");
      }
    });
  });

  describe("6. Room Activity Event Recording & FIFO Trimming (#42)", () => {
    it("pushes activity events, caps Redis list at 50, and publishes to room channel", async () => {
      const redis = await getRedis();
      const rPushSpy = vi.spyOn(redis, "rPush").mockResolvedValue(1);
      const lTrimSpy = vi.spyOn(redis, "lTrim").mockResolvedValue("OK");
      const publishSpy = vi.spyOn(redis, "publish").mockResolvedValue(1);

      const activity = await recordRoomActivity("room_test_123", {
        icon: "check",
        text: "Alice solved Problem A (+100 pts)",
        color: "green",
      });

      expect(activity).toBeDefined();
      expect(activity.icon).toBe("check");
      expect(activity.text).toContain("Alice solved");

      // Verified bounded memory cap: trims to latest 50 entries (-50, -1)
      expect(rPushSpy).toHaveBeenCalledWith(
        "room:room_test_123:activity_logs",
        expect.any(String),
      );
      expect(lTrimSpy).toHaveBeenCalledWith(
        "room:room_test_123:activity_logs",
        -50,
        -1,
      );

      // Verified SSE channel publish
      expect(publishSpy).toHaveBeenCalledWith(
        "events:room:room_test_123",
        expect.stringContaining("room.activity"),
      );
    });
  });
});
