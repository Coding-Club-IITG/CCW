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

import {
  advanceNullPlayer,
  advanceWinner,
  generateBracket,
  getBracketSnapshot,
  processNullifyMatch,
  processWalkover,
  synchronizeBracketRuntime,
} from "@/lib/contests/bracket";
import { readyOrEnterRoom } from "@/lib/contests/participation";
import { bracketProblemRequirements } from "@/lib/contests/bracketTopology";
import { reconciliationQueue } from "@/lib/contests/queues";
import { getRedis } from "@/lib/db/redis";
import { workerEnv } from "@/lib/env/worker";

import ContestMatch from "@/models/ContestMatch";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import CPUser from "@/models/CPUser";

import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

vi.mock("@/lib/contests/queues", async () => {
  const { Queue } = await import("bullmq");
  const { bullMqConnection } = await import("@/lib/queues/bullMq");
  return {
    reconciliationQueue: new Queue(`ccw-test-topology-${process.pid}`, {
      connection: bullMqConnection,
    }),
  };
});
let redis: Awaited<ReturnType<typeof getRedis>>;
beforeAll(async () => {
  const url = new URL(process.env.REDIS_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/15"
  )
    throw new Error("Local test Redis DB15 required.");
  await startTestMongo();
  redis = await getRedis();
});
afterEach(async () => {
  await reconciliationQueue.drain(true);
  for (const [records, prefix] of [
    [await ContestRoom.find().select("_id").lean(), "room"],
    [await ContestTeam.find().select("_id").lean(), "team"],
    [await ContestMatch.find().select("_id").lean(), "contest"],
  ] as const) {
    for (const record of records) {
      const keys = await redis.keys(`${prefix}:${record._id}:*`);
      if (keys.length) await redis.del(keys);
    }
  }
  await clearTestMongo();
});
afterAll(async () => {
  await reconciliationQueue.obliterate({ force: true });
  await reconciliationQueue.close();
  redis.destroy();
  await stopTestMongo();
});
async function fixture(
  count: number,
  type: "single_elimination" | "double_elimination" = "single_elimination",
  teamSize = 1,
  generate = true,
) {
  const registrations = [];
  for (let index = 0; index < count * teamSize; index++) {
    const userId = new mongoose.Types.ObjectId();
    await CPUser.create({
      userId,
      cfHandle: `fixture_${userId}`,
      cfRating:
        2500 - Math.floor(index / teamSize) * 100 + (index % teamSize) * 30,
    });
    registrations.push({
      userId,
      cfHandle: `fixture_${userId}`,
      teamName: `Team ${Math.floor(index / teamSize) + 1}`,
      registeredAt: new Date(),
    });
  }
  const contest = await ContestMatch.create({
    name: "Bracket topology fixture",
    creatorId: new mongoose.Types.ObjectId(),
    format: "bracket",
    mode: "blitz",
    teamSize,
    status: "provisioning",
    startTime: new Date(),
    registrations,
    problemSelectionMode: "test",
    bulkProblemCount: 1,
    registrationSettings: {
      type: "closed",
      deadline: new Date(),
      maxParticipants: Math.max(count, 4) * teamSize,
      entrantCapacity: Math.max(count, 4),
    },
    bracketSettings: { type },
  });
  if (generate) await generateBracket(String(contest._id));
  return contest;
}
async function play(contestId: string, lowerWins = false) {
  for (let guard = 0; guard < 100; guard++) {
    const contest = await ContestMatch.findById(contestId).lean();
    if (contest!.status === "completed") return contest!;
    const rooms = await ContestRoom.find({ contestId, status: "waiting" });
    expect(rooms.length).toBeGreaterThan(0);
    // Reverse arrival order deliberately, including lower finalist before upper finalist
    for (const room of rooms.reverse()) {
      const slot =
        lowerWins && room.bracketPosition === "grand_final-0-0" ? 1 : 0;
      await advanceWinner(
        String(room._id),
        contestId,
        String(room.bracketSlots![slot].teamId),
      );
    }
  }
  throw new Error("Bracket failed to finish.");
}

describe("persisted bracket topology and advancement", () => {
  it("persists initial ready deadlines after the scheduled start, including matches reached by byes", async () => {
    const contest = await fixture(5, "single_elimination", 1, false);
    contest.startTime = new Date(Date.now() + 60 * 60_000);
    await contest.save();
    await generateBracket(String(contest._id));
    const rooms = await ContestRoom.find({
      contestId: contest._id,
      status: "waiting",
    });
    expect(rooms.length).toBeGreaterThan(0);
    expect(
      rooms.some((room) =>
        room.bracketSlots?.some((slot) => slot.source.kind !== "seed"),
      ),
    ).toBe(true);
    for (const room of rooms) {
      const expected =
        contest.startTime.getTime() +
        workerEnv.ROOM_READY_TIMEOUT_MINUTES * 60_000;
      expect(room.readyDeadline?.getTime()).toBe(expected);
      expect(await redis.hGet(`room:${room._id}:state`, "readyDeadline")).toBe(
        String(expected),
      );
    }
  });
  it("queues recovery behind a busy transition lease without deleting its owner's lock", async () => {
    const contest = await fixture(4);
    const key = `contest:${contest._id}:transition_lock`;
    await redis.set(key, "another-owner", {
      EX: workerEnv.CONTEST_TRANSITION_LOCK_SECONDS,
    });
    await synchronizeBracketRuntime(String(contest._id));
    expect(await redis.get(key)).toBe("another-owner");
    const jobs = await reconciliationQueue.getJobs(["delayed"]);
    const recovery = jobs.find((job) => job.name === "bracket_transition");
    expect(recovery?.data.contestId).toBe(String(contest._id));
    expect(recovery?.opts.delay).toBe(
      workerEnv.CONTEST_TRANSITION_LOCK_SECONDS * 1000,
    );
  });
  it.each([3, 5, 6, 7, 9])(
    "seeds %i entrants with top-seed byes and no bye problems",
    async (count) => {
      const contest = await fixture(count);
      const rooms = await ContestRoom.find({ contestId: contest._id });
      const byes = rooms.filter((room) => room.terminationReason === "bye");
      const winners = await ContestTeam.find({
        _id: { $in: byes.map((room) => room.winnerTeamId!) },
      }).sort({ seed: 1 });
      expect(winners.map((team) => team.seed)).toEqual(
        Array.from(
          { length: 2 ** Math.ceil(Math.log2(count)) - count },
          (_, index) => index + 1,
        ),
      );
      expect(
        await ContestProblemSet.countDocuments({ contestId: contest._id }),
      ).toBe(count - 1);
      expect(
        await ContestProblemSet.countDocuments({
          roomId: { $in: byes.map((room) => room._id) },
        }),
      ).toBe(0);
      expect((await play(String(contest._id))).winnerName).toBe("Team 1");
    },
  );
  it.each([4, 5, 6, 9])(
    "completes %i-entry double elimination with and without a reset",
    async (count) => {
      for (const reset of [false, true]) {
        const contest = await fixture(count, "double_elimination");
        await play(String(contest._id), reset);
        const resetRoom = await ContestRoom.findOne({
          contestId: contest._id,
          bracketPosition: "grand_final_reset-0-0",
        });
        expect(resetRoom!.status).toBe("ended");
        expect(resetRoom!.terminationReason === "reset_not_needed").toBe(
          !reset,
        );
        if (reset) {
          const teams = await ContestTeam.find({ roomId: resetRoom!._id });
          expect(teams.map((team) => team.bracketLosses)).toEqual([1, 1]);
        }
      }
    },
    15_000,
  );
  it("freezes average team ratings and stable identities across room copies", async () => {
    const contest = await fixture(4, "single_elimination", 3);
    const frozen = await ContestMatch.findById(contest._id).lean();
    expect(frozen!.bracketEntrants![0].rating).toBe(2530);
    await CPUser.updateMany({}, { $set: { cfRating: 1 } });
    await play(String(contest._id));
    const teams = await ContestTeam.find({
      contestId: contest._id,
      name: "Team 1",
    });
    expect(new Set(teams.map((team) => String(team.entrantId))).size).toBe(1);
    expect(
      teams.every((team) => team.seed === 1 && team.frozenRating === 2530),
    ).toBe(true);
  });
  it("handles duplicate and simultaneous generation and winner delivery without duplicate teams", async () => {
    const contest = await fixture(4, "single_elimination", 1, false);
    await Promise.all([
      generateBracket(String(contest._id)),
      generateBracket(String(contest._id)),
    ]);
    expect(await ContestRoom.countDocuments({ contestId: contest._id })).toBe(
      3,
    );
    const rooms = await ContestRoom.find({
      contestId: contest._id,
      status: "waiting",
    });
    await Promise.all(
      rooms.flatMap((room) =>
        [0, 1].map(() =>
          advanceWinner(
            String(room._id),
            String(contest._id),
            String(room.teams[0]),
          ),
        ),
      ),
    );
    const final = await ContestRoom.findOne({
      contestId: contest._id,
      bracketPosition: "upper-1-0",
    });
    expect(final!.teams).toHaveLength(2);
    expect(await ContestTeam.countDocuments({ roomId: final!._id })).toBe(2);
    expect(
      final!.bracketSlots!.map((slot) => String(slot.source.roomId)),
    ).toEqual(rooms.map((room) => String(room._id)));
    await expect(
      advanceWinner(
        String(rooms[0]._id),
        String(contest._id),
        String(rooms[0].teams[1]),
      ),
    ).rejects.toThrow(/different outcome/);
  });
  it("resolves both-absent and empty lower slots to no-winner completion", async () => {
    const contest = await fixture(4, "double_elimination");
    for (let guard = 0; guard < 20; guard++) {
      if ((await ContestMatch.findById(contest._id))!.status === "completed")
        break;
      const rooms = await ContestRoom.find({
        contestId: contest._id,
        status: "waiting",
      });
      expect(rooms.length).toBeGreaterThan(0);
      for (const room of rooms)
        await advanceNullPlayer(String(contest._id), String(room._id));
    }
    expect(await ContestMatch.findById(contest._id)).toMatchObject({
      status: "completed",
      winnerName: "No Winner",
    });
    expect(await ContestTeam.countDocuments({ isNull: true })).toBe(0);
  });
  it("records audited-style overrides distinctly and sends an upper loser to its lower slot", async () => {
    const contest = await fixture(4, "double_elimination");
    const room = await ContestRoom.findOne({
      contestId: contest._id,
      bracketPosition: "upper-0-0",
    });
    const loser = await ContestTeam.findById(room!.teams[1]);
    await processWalkover(
      String(room!._id),
      String(room!.teams[0]),
      "reason",
      "admin",
    );
    const advancedLoser = await ContestTeam.findOne({
      roomId: room!.loserDestination!.roomId,
      entrantId: loser!.entrantId,
    });
    expect(advancedLoser).toMatchObject({
      name: loser!.name,
      bracketLosses: 1,
      isNull: false,
    });
    expect(
      (await getBracketSnapshot(String(contest._id))).nodes.find(
        (node) => node.roomId === String(room!._id),
      )!.walkover,
    ).toBe(true);
    const sibling = await ContestRoom.findOne({
      contestId: contest._id,
      bracketPosition: "upper-0-1",
    });
    await processNullifyMatch(String(sibling!._id), "reason", "admin");
    expect((await ContestRoom.findById(sibling!._id))!.terminationReason).toBe(
      "admin_nullify",
    );
  });
  it("rejects cross-contest and foreign-team results without writes", async () => {
    const a = await fixture(4),
      b = await fixture(4);
    const room = await ContestRoom.findOne({
      contestId: a._id,
      status: "waiting",
    });
    await expect(
      advanceWinner(String(room!._id), String(b._id), String(room!.teams[0])),
    ).rejects.toThrow(/belong/);
    await expect(
      advanceWinner(
        String(room!._id),
        String(a._id),
        String(new mongoose.Types.ObjectId()),
      ),
    ).rejects.toThrow(/eligible/);
    expect((await ContestRoom.findById(room!._id))!.status).toBe("waiting");
  });
  it("rolls back graph changes with an outer audit transaction, and replays runtime after commit", async () => {
    const contest = await fixture(4, "single_elimination", 1, false);
    await expect(
      mongoose.connection.transaction(async () => {
        await generateBracket(String(contest._id), undefined, []);
        throw new Error("audit failed");
      }),
    ).rejects.toThrow("audit failed");
    expect(await ContestRoom.countDocuments()).toBe(0);
    expect(await redis.exists(`contest:${contest._id}:meta`)).toBe(0);
    await mongoose.connection.transaction(async () => {
      await generateBracket(String(contest._id), undefined, []);
    });
    await generateBracket(String(contest._id));
    const room = await ContestRoom.findOne({
      contestId: contest._id,
      status: "waiting",
    });
    const deadline = await redis.hGet(
      `room:${room!._id}:state`,
      "readyDeadline",
    );
    for (const user of room!.participants) {
      await readyOrEnterRoom(String(room!._id), String(user));
    }
    await synchronizeBracketRuntime(String(contest._id));
    expect(await redis.hGet(`room:${room!._id}:state`, "status")).toBe(
      "active",
    );
    expect(await redis.hGet(`room:${room!._id}:state`, "readyDeadline")).toBe(
      deadline,
    );
  });
  it("excludes incomplete teams and preserves a clear cancellation below the minimum", async () => {
    const contest = await fixture(4, "double_elimination", 3, false);
    contest.registrations!.pop();
    await contest.save();
    await generateBracket(String(contest._id));
    expect(await ContestMatch.findById(contest._id)).toMatchObject({
      status: "completed",
      cancellationReason:
        "Registration closed with 3 complete entrants; 4 required.",
    });
    expect(await ContestRoom.countDocuments()).toBe(0);
  });
  it("uses stage requirements including fresh reset reserves and rolls back shortages", async () => {
    const contest = await fixture(5, "double_elimination", 1, false);
    contest.problemSelectionMode = "fine-tuned";
    let nextProblem = 1;
    contest.problemSlots = bracketProblemRequirements(
      5,
      "double_elimination",
      1,
    ).flatMap((round) =>
      Array.from({ length: round.problemCount }, () => ({
        platform: "codeforces",
        problemId: `${nextProblem++}A`,
        roundNumber: round.roundNumber,
      })),
    );
    const last = contest.problemSlots.pop()!;
    await contest.save();
    await expect(generateBracket(String(contest._id))).rejects.toThrow(/Reset/);
    expect(await ContestRoom.countDocuments()).toBe(0);
    contest.problemSlots.push(last);
    await contest.save();
    await generateBracket(String(contest._id));
    const sets = await ContestProblemSet.find({ contestId: contest._id });
    const ids = sets.flatMap((set) =>
      set.problems.map((problem) => problem.problemId),
    );
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
