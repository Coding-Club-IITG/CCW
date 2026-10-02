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

import { CONTEST_TIMING } from "@/lib/constants";

import { generateBracket } from "@/lib/contests/bracket";
import { reconcileMatch } from "@/lib/contests/gameplay";
import { readyOrEnterRoom } from "@/lib/contests/participation";
import { cfSyncQueue, reconciliationQueue } from "@/lib/contests/queues";
import {
  recoverRoomParticipation,
  synchronizeRoomRuntime,
} from "@/lib/contests/roomRuntime";
import { configureRoomTiming } from "@/lib/contests/roomTiming";
import { getRedis } from "@/lib/db/redis";
import { workerEnv } from "@/lib/env/worker";
import {
  fetchCodeforcesUserStatus,
  type CFSubmission,
} from "@/lib/platforms/codeforces";
import "@/lib/contests/workers/codeforcesSync";

import ContestMatch from "@/models/ContestMatch";
import ContestParticipation from "@/models/ContestParticipation";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestRoom from "@/models/ContestRoom";
import ContestSubmission from "@/models/ContestSubmission";
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
    reconciliationQueue: new Queue(`ccw-test-gameplay-${process.pid}`, {
      connection: bullMqConnection,
    }),
    cfSyncQueue: new Queue(`ccw-test-gameplay-cf-${process.pid}`, {
      connection: bullMqConnection,
    }),
  };
});

const processor = vi.hoisted(() => ({
  sync: null as
    null | ((job: { name: string; data: unknown }) => Promise<void>),
}));

vi.mock("bullmq", async (original) => ({
  ...(await original<typeof import("bullmq")>()),
  Worker: class {
    constructor(_name: string, callback: typeof processor.sync) {
      processor.sync = callback;
    }
    on() {
      return this;
    }
  },
}));
vi.mock("@/lib/platforms/codeforces", async (original) => ({
  ...(await original<typeof import("@/lib/platforms/codeforces")>()),
  fetchCodeforcesUserStatus: vi.fn(async () => []),
}));
vi.mock("@/lib/platforms/problemContent", async (original) => ({
  ...(await original<typeof import("@/lib/platforms/problemContent")>()),
  fetchProblemContentForScheduling: vi.fn(async () => ({
    title: "Fixture",
    statementHtml: "<p>Problem</p>",
    inputSpecificationHtml: "",
    outputSpecificationHtml: "",
    samples: [],
    sourceUrl: "https://codeforces.com",
  })),
}));

const id = () => new mongoose.Types.ObjectId();
let redis: Awaited<ReturnType<typeof getRedis>>;

beforeAll(async () => {
  const url = new URL(process.env.REDIS_URL!);

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/15"
  )
    throw new Error("Local test Redis DB15 required");

  await startTestMongo();
  redis = await getRedis();
  await Promise.all([
    ContestParticipation.init(),
    ContestProblemSet.init(),
    ContestSubmission.init(),
  ]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await cfSyncQueue.drain(true);
  await reconciliationQueue.drain(true);

  for (const [records, prefix] of [
    [await ContestRoom.find().lean(), "room"],
    [await ContestTeam.find().lean(), "team"],
    [await ContestMatch.find().lean(), "contest"],
  ] as const) {
    for (const record of records) {
      const keys = await redis.keys(`${prefix}:${record._id}:*`);

      if (keys.length) await redis.del(keys);
    }
  }

  await clearTestMongo();
});

afterAll(async () => {
  for (const queue of [cfSyncQueue, reconciliationQueue]) {
    await queue.obliterate({ force: true });
    await queue.close();
  }

  redis.destroy();
  await stopTestMongo();
});

async function fixture({
  mode = "blitz",
  timer,
  specific,
  count = 3,
  duration = 10,
}: {
  mode?: "blitz" | "arena";
  timer?: number;
  specific?: number;
  count?: number;
  duration?: number;
} = {}) {
  const base = Math.ceil(Date.now() / 1000) * 1000;
  const members = [id(), id()];
  const contest = await ContestMatch.create({
    name: "Gameplay",
    creatorId: id(),
    format: "1v1",
    mode,
    status: "active",
    problemSelectionMode: "test",
    startTime: new Date(base),
    overallDurationMinutes: duration,
    perProblemDurationMinutes: timer,
  });
  const room = new ContestRoom({
    contestId: contest._id,
    name: "Gameplay room",
    participants: members,
  });
  const teams = await ContestTeam.create(
    members.map((member, index) => ({
      roomId: room._id,
      contestId: contest._id,
      members: [member],
      name: `Team ${index}`,
      teamSize: 1,
    })),
  );

  room.teams = teams.map((team) => team._id);
  configureRoomTiming(room, contest, base);
  await room.save();
  await ContestProblemSet.create({
    contestId: contest._id,
    roomId: room._id,
    problems: Array.from({ length: count }, (_, index) => ({
      platform: "codeforces",
      problemId: `${100 + index}A`,
      name: `Problem ${index}`,
      points: 150,
      timeLimitMinutes: index === 0 ? specific : undefined,
      samples: [],
    })),
  });

  for (const member of members)
    expect(
      (await readyOrEnterRoom(String(room._id), String(member), base)).ok,
    ).toBe(true);

  const roomId = String(room._id);
  const submit = (
    team: number,
    problem: number,
    timestamp: number,
    now = timestamp + 100,
    submissionId = `${team + 1}${problem + 1}${timestamp}`,
    verdict = "OK",
  ) =>
    reconcileMatch(
      roomId,
      {
        teamId: String(teams[team]._id),
        userId: String(members[team]),
        problemId: `${100 + problem}A`,
        submissions: [{ submissionId, submittedAt: timestamp, verdict }],
      },
      now,
    );

  return {
    base,
    roomId,
    teams,
    members,
    contest,
    submit,
    reload: () => ContestRoom.findById(roomId).orFail(),
  };
}

describe("durable match timing and judging", () => {
  it("expires the specific Blitz limit without points and accepts an on-time delayed verdict once", async () => {
    const f = await fixture({ timer: 4, specific: 1 });

    await reconcileMatch(f.roomId, undefined, f.base + 60_000);
    let room = await f.reload();

    expect(room.currentProblemIndex).toBe(1);
    expect(room.problemStates[0].closeReason).toBe("expired");
    expect(room.scoreStats.map((score) => score.score)).toEqual([0, 0]);
    expect(room.problemStates[1].deadlineAt).toBe(f.base + 300_000);
    expect(
      (await f.submit(0, 0, f.base + 59_000, f.base + 65_000)).accepted,
    ).toBe(true);
    expect(
      (await f.submit(1, 0, f.base + 60_001, f.base + 66_000)).accepted,
    ).toBe(false);
    await f.submit(0, 0, f.base + 59_000, f.base + 67_000);
    room = await f.reload();

    expect(room.currentProblemIndex).toBe(1);
    expect(room.scoreStats.reduce((sum, score) => sum + score.score, 0)).toBe(
      150,
    );
    expect(
      await ContestSubmission.countDocuments({
        roomId: f.roomId,
        points: { $gt: 0 },
      }),
    ).toBe(1);
  });

  it("does not advance without an effective timer and always enforces the overall deadline", async () => {
    const f = await fixture();

    await reconcileMatch(f.roomId, undefined, f.base + 300_000);
    expect((await f.reload()).currentProblemIndex).toBe(0);
    expect((await f.reload()).problemStates[0].deadlineAt).toBeUndefined();
    await reconcileMatch(f.roomId, undefined, f.base + 600_000);
    expect((await f.reload()).gameplayEndedAt?.getTime()).toBe(
      f.base + 600_000,
    );
    expect(
      await ContestParticipation.countDocuments({ roomId: f.roomId }),
    ).toBe(2);
    expect(
      (await f.submit(0, 0, f.base + 600_001, f.base + 610_000)).accepted,
    ).toBe(false);
    expect(
      (await f.submit(0, 0, f.base + 599_000, f.base + 610_000)).accepted,
    ).toBe(true);
    await reconcileMatch(f.roomId, undefined, f.base + 720_000);

    const ended = await f.reload();

    expect(ended.status).toBe("ended");
    expect(String(ended.winnerTeamId)).toBe(String(f.teams[0]._id));
    expect(ended.currentProblemIndex).toBe(0);
    expect(
      await ContestParticipation.countDocuments({ roomId: f.roomId }),
    ).toBe(0);
    expect(await ContestProblemSet.countDocuments({ roomId: f.roomId })).toBe(
      1,
    );
  });

  it("rejects eligible timestamps delivered after grace and freezes final outcomes", async () => {
    const f = await fixture({ duration: 1 });

    expect(
      (await f.submit(0, 0, f.base + 59_000, f.base + 180_001)).accepted,
    ).toBe(false);
    const ended = await f.reload();

    expect(ended.status).toBe("ended");
    expect(ended.resultMethod).toBe("draw");
    expect(ended.winnerTeamId).toBeUndefined();
    await f.submit(1, 0, f.base + 50_000, f.base + 180_100);
    expect((await f.reload()).finalizedAt).toEqual(ended.finalizedAt);
    expect(await ContestSubmission.countDocuments({ roomId: f.roomId })).toBe(
      0,
    );
  });

  it("serializes solve and expiry races without advancing the next problem twice", async () => {
    const f = await fixture({ timer: 1 });

    await Promise.all([
      reconcileMatch(f.roomId, undefined, f.base + 60_000),
      f.submit(0, 0, f.base + 59_000, f.base + 60_000),
      f.submit(1, 0, f.base + 58_000, f.base + 60_000),
    ]);
    const room = await f.reload();

    expect(room.currentProblemIndex).toBe(1);
    expect(room.problemStates[1].revealedAt).toBe(f.base + 60_000);
    expect(room.problemStates[0].claim?.teamId).toBe(String(f.teams[1]._id));
    expect(room.scoreStats.reduce((sum, score) => sum + score.score, 0)).toBe(
      150,
    );
  });

  it("ignores Arena problem timers and recomputes claims, penalties and last solve after earlier verdicts", async () => {
    const f = await fixture({ mode: "arena", timer: 1, specific: 1 });

    expect(
      (await f.reload()).problemStates.every(
        (state) => state.deadlineAt === undefined,
      ),
    ).toBe(true);
    await f.submit(0, 0, f.base + 40_000);
    await f.submit(0, 1, f.base + 50_000);
    await f.submit(1, 1, f.base + 30_000, f.base + 60_000);
    await f.submit(
      0,
      0,
      f.base + 20_000,
      f.base + 61_000,
      "10",
      "WRONG_ANSWER",
    );
    await f.submit(
      0,
      0,
      f.base + 20_000,
      f.base + 62_000,
      "10",
      "WRONG_ANSWER",
    );
    const room = await f.reload();
    const score = room.scoreStats.find(
      (entry) => entry.teamId === String(f.teams[0]._id),
    )!;

    expect(score.score).toBe(150);
    expect(score.lastSolveAt).toBe(f.base + 40_000);
    expect(score.wrongSubmissions).toBe(1);
    expect(score.penaltyTimeMs).toBe(40_000 + 20 * 60_000);
    expect(
      await ContestSubmission.countDocuments({ roomId: f.roomId, points: 150 }),
    ).toBe(2);
  });

  it("draws a non-bracket played tie despite different solve times", async () => {
    const f = await fixture({ mode: "arena", count: 2 });

    await f.submit(0, 0, f.base + 10_000);
    await f.submit(1, 1, f.base + 20_000);
    const pending = await f.reload();

    expect(pending.status).toBe("active");
    expect(pending.judgingDeadline).toBeDefined();
    await Promise.all([
      reconcileMatch(f.roomId, undefined, pending.judgingDeadline!.getTime()),
      reconcileMatch(f.roomId, undefined, pending.judgingDeadline!.getTime()),
    ]);

    expect((await f.reload()).resultMethod).toBe("draw");
    expect((await f.reload()).winnerTeamId).toBeUndefined();
    expect((await ContestMatch.findById(f.contest._id))!.winnerName).toBe(
      "Draw",
    );
  });

  it("restores gameplay and pending jobs after Redis loss without resetting timers or awards", async () => {
    const f = await fixture({ timer: 1 });

    await f.submit(0, 0, f.base + 20_000);
    const before = await f.reload();
    await redis.del(await redis.keys(`room:${f.roomId}:*`));
    await reconciliationQueue.drain(true);
    vi.spyOn(Date, "now").mockReturnValue(f.base + 30_000);
    await recoverRoomParticipation();

    const after = await f.reload();
    const state = await redis.hGetAll(`room:${f.roomId}:state`);
    const problems = (
      await redis.lRange(`room:${f.roomId}:problems`, 0, -1)
    ).map((raw) => JSON.parse(raw));

    expect(after.toObject().problemStates).toEqual(
      before.toObject().problemStates,
    );
    expect(state.currentProblem).toBe("1");
    expect(
      await redis.zScore(`room:${f.roomId}:scores`, String(f.teams[0]._id)),
    ).toBe(150);
    expect(problems[1].deadlineAt).toBe(before.problemStates[1].deadlineAt);
    expect(problems[1].samples).toEqual([]);
    expect(
      await reconciliationQueue.getJob(`problem_timeout-${f.roomId}-1`),
    ).not.toBeNull();
  });

  it("persists pending verdicts and reconstructs judging polls while disconnected", async () => {
    const f = await fixture({ timer: 1 });
    const userId = String(f.members[0]);

    await CPUser.create({ userId, cfHandle: "fixture", cfVerified: true });
    const submission = {
      id: 123,
      creationTimeSeconds: (f.base + 50_000) / 1000,
      problem: { contestId: 100, index: "A" },
      author: { members: [{ handle: "fixture" }] },
      verdict: "TESTING",
    } as CFSubmission;
    const data = {
      roomId: f.roomId,
      userId,
      teamId: String(f.teams[0]._id),
      cfHandle: "fixture",
      problemId: "100A",
    };

    vi.spyOn(Date, "now").mockReturnValue(f.base + 61_000);
    vi.mocked(fetchCodeforcesUserStatus).mockResolvedValueOnce([submission]);
    await processor.sync!({ name: "cf_sync", data });
    expect(await ContestSubmission.countDocuments({ verdict: "TESTING" })).toBe(
      1,
    );
    await cfSyncQueue.drain(true);
    await synchronizeRoomRuntime(f.roomId);
    expect((await cfSyncQueue.getDelayed()).length).toBe(1);
    vi.mocked(fetchCodeforcesUserStatus).mockResolvedValueOnce([
      { ...submission, verdict: "OK" },
    ]);
    await processor.sync!({ name: "cf_sync", data });

    expect((await f.reload()).currentProblemIndex).toBe(1);
    expect(
      await ContestSubmission.countDocuments({ verdict: "OK", points: 150 }),
    ).toBe(1);
    expect((await f.reload()).scoreStats[0].wrongSubmissions).toBe(0);
  });

  it("uses snapshotted grace after environment defaults change and retains the Arena penalty", async () => {
    const f = await fixture({ mode: "arena", duration: 1 });
    const grace = workerEnv.CONTEST_JUDGING_GRACE_SECONDS;

    try {
      workerEnv.CONTEST_JUDGING_GRACE_SECONDS = 1;
      await f.submit(
        0,
        0,
        f.base + 10_000,
        f.base + 100_000,
        "5",
        "WRONG_ANSWER",
      );
      expect(
        (await f.reload()).scoreStats.find(
          (score) => score.teamId === String(f.teams[0]._id),
        )!.penaltyTimeMs,
      ).toBe(CONTEST_TIMING.arenaWrongPenaltyMinutes * 60_000);
      expect((await f.reload()).judgingDeadline?.getTime()).toBe(
        f.base + 60_000 + grace * 1000,
      );
    } finally {
      workerEnv.CONTEST_JUDGING_GRACE_SECONDS = grace;
    }
  });

  it("finalizes a played 0-0 bracket by frozen seed and advances idempotently", async () => {
    const members = [id(), id(), id(), id()];
    const contest = await ContestMatch.create({
      name: "Seed tie",
      creatorId: id(),
      format: "bracket",
      mode: "blitz",
      status: "provisioning",
      teamSize: 1,
      problemSelectionMode: "test",
      bulkProblemCount: 1,
      overallDurationMinutes: 1,
      registrationSettings: {
        type: "closed",
        deadline: new Date(),
        maxParticipants: 4,
        entrantCapacity: 4,
      },
      registrations: members.map((userId, index) => ({
        userId,
        cfHandle: `seed_${index}`,
      })),
      bracketSettings: { type: "single_elimination" },
    });

    await CPUser.create(
      members.map((userId, index) => ({
        userId,
        cfHandle: `seed_${index}`,
        cfVerified: true,
        cfRating: 2000 - index * 100,
      })),
    );
    await generateBracket(String(contest._id));
    const room = await ContestRoom.findOne({
      contestId: contest._id,
      status: "waiting",
    }).orFail();
    const teams = await ContestTeam.find({ roomId: room._id }).sort({
      seed: 1,
    });

    for (const member of room.participants)
      await readyOrEnterRoom(String(room._id), String(member));
    await CPUser.updateMany({}, { $set: { cfRating: 0 } });
    const active = await ContestRoom.findById(room._id).orFail();
    const at =
      active.matchDeadline!.getTime() + active.judgingGraceSeconds! * 1000;

    await Promise.all([
      reconcileMatch(String(room._id), undefined, at),
      reconcileMatch(String(room._id), undefined, at),
    ]);
    const ended = await ContestRoom.findById(room._id).orFail();

    expect(ended.resultMethod).toBe("seed");
    expect(String(ended.winnerTeamId)).toBe(String(teams[0]._id));
    expect(ended.advancementCompletedAt).toBeDefined();
    expect(
      await ContestTeam.countDocuments({
        roomId: ended.winnerDestination!.roomId,
      }),
    ).toBe(1);
    expect((await ContestTeam.findById(teams[0]._id))!.isNull).toBe(false);
  });
});
