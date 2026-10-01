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
import ContestRound from "@/models/ContestRound";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import ContestProblemSet from "@/models/ContestProblemSet";
import CPUser from "@/models/CPUser";
import User from "@/models/User";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import {
  generateBracket,
  generateDoubleBracket,
  advanceWinner,
  advanceNullPlayer,
  processWalkover,
  processNullifyMatch,
  getBracketSnapshot,
} from "@/lib/contests/bracket";

const reconciliationQueueAdd = vi.hoisted(() => vi.fn());

const createMockRedis = () => {
  const store = new Map<string, any>();
  return {
    del: vi.fn(async (key: string) => store.delete(key)),
    rPush: vi.fn(async (key: string, val: any) => {
      if (!store.has(key)) store.set(key, []);
      const arr = store.get(key);
      if (Array.isArray(val)) arr.push(...val);
      else arr.push(val);
      return arr.length;
    }),
    hSet: vi.fn(async (key: string, val: any) => {
      const existing = store.get(key) || {};
      store.set(key, { ...existing, ...val });
      return 1;
    }),
    hGetAll: vi.fn(async (key: string) => store.get(key) || {}),
    sAdd: vi.fn(async (key: string, member: string) => {
      if (!store.has(key)) store.set(key, new Set());
      store.get(key).add(member);
      return 1;
    }),
    sMembers: vi.fn(async (key: string) => {
      const s = store.get(key);
      return s ? Array.from(s) : [];
    }),
    zScore: vi.fn(async () => null),
    zAdd: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    publish: vi.fn(async () => 1),
  };
};

const mockRedis = createMockRedis();

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(async () => mockRedis),
}));

vi.mock("@/lib/contests/queues", () => ({
  reconciliationQueue: { add: reconciliationQueueAdd, remove: vi.fn() },
  cfSyncQueue: { add: vi.fn() },
}));

vi.mock("@/lib/contests/events", () => ({
  publishContest: vi.fn(async () => undefined),
  publishRoom: vi.fn(async () => undefined),
  recordRoomActivity: vi.fn(async () => undefined),
}));

describe("Bracket Tournament — Null Player Architecture & Design Suite (#57)", () => {
  let adminUser: any;
  let testUsers: any[] = [];
  let mongoConnected = false;

  beforeAll(async () => {
    try {
      const url = new URL(
        process.env.MONGODB_TEST_URI ||
          "mongodb://localhost:27017/?replicaSet=rs0&retryWrites=false",
      );
      await mongoose.connect(url.toString(), { serverSelectionTimeoutMS: 2000 });
      await mongoose.disconnect();
      await startTestMongo();
      mongoConnected = true;
    } catch {
      mongoConnected = false;
    }
  });

  afterEach(async () => {
    if (!mongoConnected) return;
    await clearTestMongo();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (!mongoConnected) return;
    await stopTestMongo();
  });

  beforeEach((context) => {
    if (!mongoConnected) {
      context.skip();
    }
  });

  const setupUsers = async (count: number = 8) => {
    adminUser = await User.create({
      name: "Admin User",
      email: "admin@test.com",
      role: "admin",
      access: "Admin",
    });

    testUsers = [];
    for (let i = 1; i <= count; i++) {
      const u = await User.create({
        name: `User ${i}`,
        email: `user${i}@test.com`,
        codeforcesId: `cf_${i}`,
      });
      await CPUser.create({
        userId: u._id,
        cfHandle: `cf_${i}`,
        rating: 1200 + i * 50,
      });
      testUsers.push(u);
    }
  };

  const createTestContest = async (
    eliminationType: "single" | "double" = "single",
    teamCount: number = 4,
  ) => {
    const contest = await ContestMatch.create({
      name: "Championship Tournament",
      format: "bracket",
      mode: "blitz",
      status: "active",
      teamSize: 1,
      creatorId: adminUser._id,
      duration: 30,
      startTime: new Date(Date.now() - 5000),
      endTime: new Date(Date.now() + 3600000),
      eliminationType:
        eliminationType === "double"
          ? "double_elimination"
          : "single_elimination",
      grandFinalState: eliminationType === "double" ? "pending" : undefined,
    });

    // Populate problem set
    await ContestProblemSet.create({
      contestId: contest._id,
      problems: [
        { problemId: "100A", name: "Problem A", rating: 1200, points: 120 },
        { problemId: "100B", name: "Problem B", rating: 1300, points: 130 },
      ],
    });

    // Seed registrations
    const assignments = [];
    for (let i = 0; i < teamCount; i++) {
      assignments.push({
        teamName: `Team ${String.fromCharCode(65 + i)}`,
        memberIds: [testUsers[i]._id.toString()],
      });
    }

    if (eliminationType === "single") {
      await generateBracket(contest._id.toString(), assignments);
    } else {
      await generateDoubleBracket(contest._id.toString(), assignments);
    }

    return contest;
  };

  describe("S1 & S2 & S8: Ready Phase Timeouts, Walkovers, and Admin Nullify", () => {
    it("Scenario S2 & S8: Admin forces walkover for Team A, marking loser eliminated", async () => {
      await setupUsers(4);
      const contest = await createTestContest("single", 4);

      // Find Match 1 (round 1, match 0)
      const r1Rooms = await ContestRoom.find({
        contestId: contest._id,
        bracketPosition: "0-0",
      });
      expect(r1Rooms).toHaveLength(1);
      const room = r1Rooms[0];
      expect(room.teams).toHaveLength(2);

      const teamAId = room.teams[0].toString();
      const teamBId = room.teams[1].toString();

      // Process walkover for Team A
      const snapshot = await processWalkover(
        room._id.toString(),
        teamAId,
        "Team B forfeited",
        adminUser._id.toString(),
      );

      // Verify room state
      const updatedRoom = await ContestRoom.findById(room._id);
      expect(updatedRoom?.status).toBe("ended");
      expect(updatedRoom?.terminationReason).toBe("walkover");
      expect(updatedRoom?.winnerTeamId?.toString()).toBe(teamAId);

      // Verify loser is marked eliminated and null
      const loserTeam = await ContestTeam.findById(teamBId);
      expect(loserTeam?.isNull).toBe(true);
      expect(loserTeam?.name).toBe("[Eliminated]");

      // Verify winner advanced to Round 2
      const r2Room = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "1-0",
      });
      expect(r2Room).toBeDefined();
      expect(r2Room?.teams.length).toBeGreaterThanOrEqual(1);

      const advancedTeam = await ContestTeam.findById(r2Room?.teams[0]);
      expect(advancedTeam?.name).toBe("Team A");
      expect(advancedTeam?.isNull).toBe(false);

      // Verify snapshot reflection
      const node = snapshot.nodes.find((n) => n.roomId === room._id.toString());
      expect(node?.walkover).toBe(true);
      expect(node?.winner).toBe(teamAId);
    });

    it("Scenario S1 & S8: Admin nullifies match (both eliminated) -> advances virtual null player", async () => {
      await setupUsers(4);
      const contest = await createTestContest("single", 4);

      const room = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "0-0",
      });
      expect(room).toBeDefined();

      const teamAId = room!.teams[0];
      const teamBId = room!.teams[1];

      // Admin nullifies match
      await processNullifyMatch(
        room!._id.toString(),
        "Both teams no-show",
        adminUser._id.toString(),
      );

      const updatedRoom = await ContestRoom.findById(room!._id);
      expect(updatedRoom?.status).toBe("ended");
      expect(updatedRoom?.terminationReason).toBe("admin_nullify");

      const tA = await ContestTeam.findById(teamAId);
      const tB = await ContestTeam.findById(teamBId);
      expect(tA?.isNull).toBe(true);
      expect(tB?.isNull).toBe(true);
      expect(tA?.name).toBe("[Eliminated]");
      expect(tB?.name).toBe("[Eliminated]");

      // Next round room should receive a virtual null player
      const r2Room = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "1-0",
      });
      expect(r2Room?.teams.length).toBe(1);
      const nullTeamInR2 = await ContestTeam.findById(r2Room?.teams[0]);
      expect(nullTeamInR2?.isNull).toBe(true);
      expect(nullTeamInR2?.name).toBe("[Eliminated]");
    });
  });

  describe("S5 & S6: Null Player Invariants and Automated Resolution Cascades", () => {
    it("Scenario S5: Null player automatically loses to real player via instant walkover without playing", async () => {
      await setupUsers(4);
      const contest = await createTestContest("single", 4);

      const match0 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "0-0",
      });
      const match1 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "0-1",
      });

      // Match 0: Both no-show -> null advances to finals (slot 0)
      await advanceNullPlayer(contest._id.toString(), match0!._id.toString());

      const finalsRoom = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "1-0",
      });
      expect(finalsRoom?.teams).toHaveLength(1);
      const slot0Team = await ContestTeam.findById(finalsRoom?.teams[0]);
      expect(slot0Team?.isNull).toBe(true);

      // Match 1: Team C wins normally -> advances to finals (slot 1)
      const teamCId = match1!.teams[0].toString();
      await advanceWinner(
        match1!._id.toString(),
        contest._id.toString(),
        teamCId,
      );

      // Check finals room: With Null vs Real, it must automatically resolve via walkover!
      const updatedFinals = await ContestRoom.findById(finalsRoom?._id);
      expect(updatedFinals?.status).toBe("ended");
      expect(updatedFinals?.terminationReason).toBe("walkover");

      const winnerTeam = await ContestTeam.findById(updatedFinals?.winnerTeamId);
      expect(winnerTeam?.name).toBe("Team C");
      expect(winnerTeam?.score).toBe(1);

      // Tournament crowns Team C
      const updatedContest = await ContestMatch.findById(contest._id);
      expect(updatedContest?.status).toBe("completed");
      expect(updatedContest?.winnerName).toBe("Team C");
    });

    it("Scenario S6 & S10: Null vs Null tournament cascade results in 'No Winner'", async () => {
      await setupUsers(4);
      const contest = await createTestContest("single", 4);

      const match0 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "0-0",
      });
      const match1 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "0-1",
      });

      // Both Round 1 matches have no-shows
      await advanceNullPlayer(contest._id.toString(), match0!._id.toString());
      await advanceNullPlayer(contest._id.toString(), match1!._id.toString());

      // Finals room: Null vs Null automatically completes with both_null
      const finalsRoom = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "1-0",
      });
      expect(finalsRoom?.status).toBe("ended");
      expect(finalsRoom?.terminationReason).toBe("both_null");

      // Tournament completes with "No Winner"
      const updatedContest = await ContestMatch.findById(contest._id);
      expect(updatedContest?.status).toBe("completed");
      expect(updatedContest?.winnerName).toBe("No Winner");
    });
  });

  describe("S7: Double Elimination Grand Final Reset Logic", () => {
    it("Grand Final: Upper Bracket Winner wins -> crowned immediately, no reset spawned", async () => {
      await setupUsers(4);
      const contest = await createTestContest("double", 4);

      // In 4-team double elim:
      // Upper R1 has 2 matches: upper-0-0 and upper-0-1
      const upperR1M0 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "upper-0-0",
      });
      const upperR1M1 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "upper-0-1",
      });

      // Upper R1-M0: Team A wins
      await advanceWinner(
        upperR1M0!._id.toString(),
        contest._id.toString(),
        upperR1M0!.teams[0].toString(),
      );
      // Upper R1-M1: Team C wins
      await advanceWinner(
        upperR1M1!._id.toString(),
        contest._id.toString(),
        upperR1M1!.teams[0].toString(),
      );

      // Upper Final: upper-1-0 (Team A vs Team C)
      const upperFinal = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "upper-1-0",
      });
      expect(upperFinal).toBeDefined();
      expect(upperFinal?.teams).toHaveLength(2);

      // Team A wins Upper Final -> advances to Grand Final
      const teamAInUpperFinal = upperFinal!.teams[0].toString();
      await advanceWinner(
        upperFinal!._id.toString(),
        contest._id.toString(),
        teamAInUpperFinal,
      );

      // Lower R1: lower-0-0 (Loser A vs Loser C: Team B vs Team D)
      const lowerR1 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "lower-0-0",
      });
      expect(lowerR1).toBeDefined();
      // Team B wins Lower R1
      await advanceWinner(
        lowerR1!._id.toString(),
        contest._id.toString(),
        lowerR1!.teams[0].toString(),
      );

      // Lower Final: lower-1-0 (Team B vs Loser Upper Final Team C)
      const lowerFinal = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "lower-1-0",
      });
      expect(lowerFinal).toBeDefined();
      // Team B wins Lower Final -> advances to Grand Final
      await advanceWinner(
        lowerFinal!._id.toString(),
        contest._id.toString(),
        lowerFinal!.teams[0].toString(),
      );

      // Grand Final: gf-0-0
      const gfRoom = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "gf-0-0",
      });
      expect(gfRoom).toBeDefined();
      expect(gfRoom?.teams).toHaveLength(2);

      // UPPER FINALIST (slot 0: Team A) wins Grand Final
      const upperFinalistId = gfRoom!.teams[0].toString();
      await advanceWinner(
        gfRoom!._id.toString(),
        contest._id.toString(),
        upperFinalistId,
      );

      const finalContest = await ContestMatch.findById(contest._id);
      expect(finalContest?.status).toBe("completed");
      expect(finalContest?.winnerName).toBe("Team A");
      expect(finalContest?.grandFinalState).toBe("complete");

      // Verify NO reset match was created
      const resetRoom = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "gf-1-0",
      });
      expect(resetRoom).toBeNull();
    });

    it("Grand Final: Lower Bracket Winner beats Upper Winner -> spawns Bracket Reset Match", async () => {
      await setupUsers(4);
      const contest = await createTestContest("double", 4);

      const upperR1M0 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "upper-0-0",
      });
      const upperR1M1 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "upper-0-1",
      });

      // Upper R1-M0: Team A wins
      await advanceWinner(
        upperR1M0!._id.toString(),
        contest._id.toString(),
        upperR1M0!.teams[0].toString(),
      );
      // Upper R1-M1: Team C wins
      await advanceWinner(
        upperR1M1!._id.toString(),
        contest._id.toString(),
        upperR1M1!.teams[0].toString(),
      );

      // Upper Final: Team A wins
      const upperFinal = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "upper-1-0",
      });
      await advanceWinner(
        upperFinal!._id.toString(),
        contest._id.toString(),
        upperFinal!.teams[0].toString(),
      );

      // Lower R1: Team B wins
      const lowerR1 = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "lower-0-0",
      });
      await advanceWinner(
        lowerR1!._id.toString(),
        contest._id.toString(),
        lowerR1!.teams[0].toString(),
      );

      // Lower Final: Team B wins
      const lowerFinal = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "lower-1-0",
      });
      await advanceWinner(
        lowerFinal!._id.toString(),
        contest._id.toString(),
        lowerFinal!.teams[0].toString(),
      );

      // Grand Final
      const gfRoom = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "gf-0-0",
      });
      expect(gfRoom).toBeDefined();

      // LOWER FINALIST (slot 1: Team B) wins Grand Final
      const lowerFinalistId = gfRoom!.teams[1].toString();
      await advanceWinner(
        gfRoom!._id.toString(),
        contest._id.toString(),
        lowerFinalistId,
      );

      // Check contest state: Must NOT be completed yet, must be reset_in_progress
      const resetContest = await ContestMatch.findById(contest._id);
      expect(resetContest?.status).toBe("active");
      expect(resetContest?.grandFinalState).toBe("reset_in_progress");

      // Verify Grand Final Reset match was created
      const resetRoom = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "gf-1-0",
      });
      expect(resetRoom).toBeDefined();
      expect(resetRoom?.name).toContain("Grand Final (Reset)");
      expect(resetRoom?.teams).toHaveLength(2);

      // Now play the Reset Match: Lower Finalist (Team B) wins again!
      const teamBResetId = resetRoom!.teams[1].toString();
      await advanceWinner(
        resetRoom!._id.toString(),
        contest._id.toString(),
        teamBResetId,
      );

      // Contest is finally completed, Team B is Champion!
      const completedContest = await ContestMatch.findById(contest._id);
      expect(completedContest?.status).toBe("completed");
      expect(completedContest?.winnerName).toBe("Team B");
      expect(completedContest?.grandFinalState).toBe("complete");
    });
  });

  describe("Snapshot & Presentation Metadata", () => {
    it("getBracketSnapshot includes teamIsNull, walkover, and grandFinalState", async () => {
      await setupUsers(4);
      const contest = await createTestContest("single", 4);

      const r1Room = await ContestRoom.findOne({
        contestId: contest._id,
        bracketPosition: "0-0",
      });

      await processWalkover(
        r1Room!._id.toString(),
        r1Room!.teams[0].toString(),
        "Team B no-show",
        adminUser._id.toString(),
      );

      const snapshot = await getBracketSnapshot(contest._id.toString());
      expect(snapshot).toBeDefined();
      expect(snapshot.nodes.length).toBeGreaterThan(0);

      const walkoverNode = snapshot.nodes.find(
        (n) => n.roomId === r1Room!._id.toString(),
      );
      expect(walkoverNode?.walkover).toBe(true);
      expect(walkoverNode?.terminationReason).toBe("walkover");
      expect(walkoverNode?.teamIsNull).toEqual([false, true]);
    });
  });
});
