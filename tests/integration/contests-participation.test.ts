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
  advanceWinner,
  generateBracket,
  processWalkover,
} from "@/lib/contests/bracket";
import {
  finishRoomParticipation,
  readyOrEnterRoom,
} from "@/lib/contests/participation";
import { updateRoomPresence } from "@/lib/contests/presence";
import { reconciliationQueue } from "@/lib/contests/queues";
import {
  recoverRoomParticipation,
  synchronizeRoomRuntime,
} from "@/lib/contests/roomRuntime";
import { configureRoomTiming } from "@/lib/contests/roomTiming";
import { registerContestMember } from "@/lib/contests/registration";
import {
  fetchCodeforcesUserStatus,
  type CFSubmission,
} from "@/lib/platforms/codeforces";
import "@/lib/contests/workers/codeforcesSync";
import "@/lib/contests/workers/reconciliation";
import { getRedis } from "@/lib/db/redis";
import { workerEnv } from "@/lib/env/worker";

import ContestMatch from "@/models/ContestMatch";
import ContestParticipation from "@/models/ContestParticipation";
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
    reconciliationQueue: new Queue(`ccw-test-participation-${process.pid}`, {
      connection: bullMqConnection,
    }),
  };
});

type TestJob = { name: string; data: Record<string, unknown>; id: string };
const processors = vi.hoisted(
  () => new Map<string, (job: TestJob) => Promise<void>>(),
);

vi.mock("bullmq", async (original) => ({
  ...(await original<typeof import("bullmq")>()),
  Worker: class {
    constructor(name: string, processor: (job: TestJob) => Promise<void>) {
      processors.set(name, processor);
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
  await ContestParticipation.init();
});

afterEach(async () => {
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
  await reconciliationQueue.obliterate({ force: true });
  await reconciliationQueue.close();
  redis.destroy();
  await stopTestMongo();
});

async function roomFixture({
  members = [[id()], [id()]],
  start = Date.now() - 1000,
  mode = "blitz",
}: {
  members?: mongoose.Types.ObjectId[][];
  start?: number;
  mode?: "blitz" | "arena";
} = {}) {
  const contest = await ContestMatch.create({
    name: "Participation",
    problemSelectionMode: "test",
    creatorId: id(),
    mode,
    format: members[0].length === 1 ? "1v1" : "team-tournament",
    teamSize: members[0].length,
    startTime: new Date(start),
    status: "active",
  });
  const room = new ContestRoom({
    contestId: contest._id,
    name: "Participation room",
    status: "waiting",
    participants: members.flat(),
  });
  const teams = await ContestTeam.create(
    members.map((users, index) => ({
      contestId: contest._id,
      roomId: room._id,
      name: `Team ${index + 1}`,
      members: users,
      teamSize: users.length,
    })),
  );

  room.teams = teams.map((team) => team._id);
  configureRoomTiming(room, contest);
  await room.save();
  await ContestProblemSet.create({
    contestId: contest._id,
    roomId: room._id,
    problems: ["100A", "100B"].map((problemId) => ({
      platform: "codeforces",
      problemId,
      name: problemId,
      points: 100,
    })),
  });
  await synchronizeRoomRuntime(String(room._id));

  return {
    room,
    contest,
    teams,
    members,
    roomId: String(room._id),
    opens: room.readyOpensAt!.getTime(),
    deadline: room.readyDeadline!.getTime(),
  };
}

async function startEveryone(f: Awaited<ReturnType<typeof roomFixture>>) {
  for (const user of f.members.flat()) {
    expect((await readyOrEnterRoom(f.roomId, String(user))).ok).toBe(true);
  }
}

async function bracketFixture() {
  const registrations = [];

  for (let i = 0; i < 4; i++) {
    const userId = id();

    await CPUser.create({
      userId,
      cfHandle: `ready_${userId}`,
      cfRating: 2000 - i * 100,
    });
    registrations.push({
      userId,
      cfHandle: `ready_${userId}`,
      registeredAt: new Date(),
    });
  }

  const contest = await ContestMatch.create({
    name: "Double no-shows",
    creatorId: id(),
    mode: "blitz",
    format: "bracket",
    teamSize: 1,
    status: "provisioning",
    startTime: new Date(),
    registrations,
    problemSelectionMode: "test",
    bulkProblemCount: 1,
    registrationSettings: {
      type: "closed",
      deadline: new Date(),
      entrantCapacity: 4,
      maxParticipants: 4,
    },
    bracketSettings: { type: "double_elimination" },
  });

  await generateBracket(String(contest._id));

  return contest;
}

describe("readiness and durable live participation", () => {
  it("rejects early readiness and keeps the original window when defaults change", async () => {
    const f = await roomFixture({ start: Date.now() + 60_000 });
    const result = await readyOrEnterRoom(f.roomId, String(f.members[0][0]));

    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect((await ContestRoom.findById(f.roomId))!.readyUserIds).toHaveLength(
      0,
    );
    const original = workerEnv.ROOM_READY_TIMEOUT_MINUTES;
    const duration = workerEnv.CONTEST_DEFAULT_MATCH_MINUTES;

    try {
      workerEnv.ROOM_READY_TIMEOUT_MINUTES = original + 1;
      workerEnv.CONTEST_DEFAULT_MATCH_MINUTES = duration + 1;
      await synchronizeRoomRuntime(f.roomId);
      const state = await redis.hGetAll(`room:${f.roomId}:state`);

      expect(Number(state.readyDeadline)).toBe(f.deadline);
      expect(Number(state.timeLimit)).toBe(f.room.durationSeconds);
    } finally {
      workerEnv.ROOM_READY_TIMEOUT_MINUTES = original;
      workerEnv.CONTEST_DEFAULT_MATCH_MINUTES = duration;
    }
  });

  it.each(["blitz", "arena"] as const)(
    "starts %s once everyone is ready and makes repeated tabs idempotent",
    async (mode) => {
      const f = await roomFixture({ mode });

      await Promise.all(
        f.members
          .flat()
          .map((user) => readyOrEnterRoom(f.roomId, String(user))),
      );
      const started = await ContestRoom.findById(f.roomId);

      expect(started!.status).toBe("active");
      expect(started!.admissions).toHaveLength(2);
      expect(await ContestParticipation.countDocuments()).toBe(2);
      await Promise.all([
        readyOrEnterRoom(f.roomId, String(f.members[0][0])),
        readyOrEnterRoom(f.roomId, String(f.members[0][0])),
      ]);
      const repeated = await ContestRoom.findById(f.roomId);

      expect(repeated!.actualStartTime).toEqual(started!.actualStartTime);
      expect(repeated!.matchDeadline).toEqual(started!.matchDeadline);
      expect(repeated!.admissions).toHaveLength(2);
      const problems = (
        await redis.lRange(`room:${f.roomId}:problems`, 0, -1)
      ).map((raw) => JSON.parse(raw));

      expect(problems.filter((problem) => problem.revealedAt)).toHaveLength(
        mode === "arena" ? 2 : 1,
      );
      expect(
        (await reconciliationQueue.getJob(`room-timeout-${f.roomId}`))!
          .timestamp +
          (await reconciliationQueue.getJob(`room-timeout-${f.roomId}`))!.delay,
      ).toBeCloseTo(started!.matchDeadline!.getTime(), -1);
    },
  );

  it("admits partial teams at the deadline without changing their rosters and permits late entry", async () => {
    const f = await roomFixture({
      members: [
        [id(), id(), id()],
        [id(), id(), id()],
      ],
    });

    await readyOrEnterRoom(f.roomId, String(f.members[0][0]));
    await readyOrEnterRoom(f.roomId, String(f.members[1][0]));
    expect((await ContestRoom.findById(f.roomId))!.status).toBe("waiting");
    await readyOrEnterRoom(f.roomId, undefined, f.deadline);
    const started = await ContestRoom.findById(f.roomId);

    expect(started!.admissions).toHaveLength(2);
    expect(started!.participants).toHaveLength(6);
    expect((await ContestTeam.findById(f.teams[0]._id))!.members).toHaveLength(
      3,
    );
    const lateAt = f.deadline + 1000;

    expect(
      (await readyOrEnterRoom(f.roomId, String(f.members[0][1]), lateAt)).ok,
    ).toBe(true);
    const admitted = await ContestParticipation.findById(f.members[0][1]);

    expect(admitted!.admittedAt.getTime()).toBe(lateAt);
    expect((await ContestRoom.findById(f.roomId))!.admissions).toHaveLength(3);
    expect(await redis.sMembers(`team:${f.teams[0]._id}:users`)).toHaveLength(
      3,
    );
  });

  it("arbitrates simultaneous room starts and keeps another room's deadline running", async () => {
    const shared = id();
    const first = await roomFixture({ members: [[shared], [id()]] });
    const second = await roomFixture({ members: [[shared], [id()]] });

    await readyOrEnterRoom(first.roomId, String(shared));
    await readyOrEnterRoom(second.roomId, String(shared));
    await Promise.all([
      readyOrEnterRoom(first.roomId, String(first.members[1][0])),
      readyOrEnterRoom(second.roomId, String(second.members[1][0])),
    ]);
    const active = await ContestRoom.findOne({ status: "active" });
    const waiting = await ContestRoom.findOne({ status: "waiting" });

    expect(active).not.toBeNull();
    expect(waiting).not.toBeNull();
    expect(String((await ContestParticipation.findById(shared))!.roomId)).toBe(
      String(active!._id),
    );
    expect(waiting!.readyUserIds.map(String)).not.toContain(String(shared));
    await readyOrEnterRoom(
      String(waiting!._id),
      undefined,
      waiting!.readyDeadline!.getTime(),
    );
    const ended = await ContestRoom.findById(waiting!._id);

    expect(ended!.terminationReason).toBe("opponent_absent");
    expect(ended!.status).toBe("ended");
    expect(String((await ContestParticipation.findById(shared))!.roomId)).toBe(
      String(active!._id),
    );
  });

  it("blocks late entry while another match is live and admits after that match ends", async () => {
    const shared = id();
    const first = await roomFixture({ members: [[shared], [id()]] });
    const second = await roomFixture({
      members: [
        [id(), shared, id()],
        [id(), id(), id()],
      ],
    });

    await startEveryone(first);
    await readyOrEnterRoom(second.roomId, String(second.members[0][0]));
    await readyOrEnterRoom(second.roomId, String(second.members[1][0]));
    await readyOrEnterRoom(second.roomId, undefined, second.deadline);
    expect(
      await readyOrEnterRoom(
        second.roomId,
        String(shared),
        second.deadline + 1,
      ),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    await finishRoomParticipation(first.roomId);
    expect(
      (
        await readyOrEnterRoom(
          second.roomId,
          String(shared),
          second.deadline + 2,
        )
      ).ok,
    ).toBe(true);
    expect(String((await ContestParticipation.findById(shared))!.roomId)).toBe(
      second.roomId,
    );
  });

  it("retains claims, readiness and timers after every connection disappears", async () => {
    const f = await roomFixture();
    const connection = {
      userId: String(f.members[0][0]),
      id: "tab",
      expirySeconds: 45,
    };

    await startEveryone(f);
    const before = await ContestRoom.findById(f.roomId);

    await updateRoomPresence(f.roomId, "refresh", connection);
    await updateRoomPresence(f.roomId, "remove", connection);
    const after = await ContestRoom.findById(f.roomId);

    expect(after!.status).toBe("active");
    expect(after!.matchDeadline).toEqual(before!.matchDeadline);
    expect(after!.readyUserIds).toEqual(before!.readyUserIds);
    expect(
      await ContestParticipation.countDocuments({ roomId: f.roomId }),
    ).toBe(2);
    expect(
      (await reconciliationQueue.getJobs(["delayed", "waiting"])).map(
        (job) => job.name,
      ),
    ).not.toContain("mid_match_disconnect_timeout");
  });

  it("does not count a new ready declaration at or after the deadline", async () => {
    const f = await roomFixture();

    const result = await readyOrEnterRoom(
      f.roomId,
      String(f.members[0][0]),
      f.deadline,
    );

    expect(result.ok).toBe(false);
    expect((await ContestRoom.findById(f.roomId))!.terminationReason).toBe(
      "both_absent",
    );
    expect(await ContestParticipation.countDocuments()).toBe(0);
    expect((await ContestMatch.findById(f.contest._id))!.status).toBe(
      "completed",
    );
  });

  it("rejects foreign roster and team IDs without taking claims", async () => {
    const f = await roomFixture();

    expect(await readyOrEnterRoom(f.roomId, String(id()))).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    await ContestTeam.updateOne(
      { _id: f.teams[0]._id },
      { $set: { contestId: id() } },
    );
    expect(
      await readyOrEnterRoom(f.roomId, String(f.members[0][0])),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await ContestParticipation.countDocuments()).toBe(0);
  });

  it("recovers missing runtime and deadline jobs from persisted state without moving admission times", async () => {
    const f = await roomFixture();

    await startEveryone(f);
    const before = await ContestRoom.findById(f.roomId);
    await reconciliationQueue.drain(true);
    await redis.del(await redis.keys(`room:${f.roomId}:*`));
    await recoverRoomParticipation();
    const after = await ContestRoom.findById(f.roomId);
    const state = await redis.hGetAll(`room:${f.roomId}:state`);

    expect(state.startTime).toBe(String(before!.actualStartTime!.getTime()));
    expect(state.matchDeadline).toBe(String(before!.matchDeadline!.getTime()));
    expect(after!.toObject().admissions).toEqual(before!.toObject().admissions);
    expect(
      await reconciliationQueue.getJob(`room-timeout-${f.roomId}`),
    ).toBeDefined();
    expect(
      await redis.sMembers(`room:${f.roomId}:admitted_users`),
    ).toHaveLength(2);
    expect(after!.runtimeSyncPending).toBe(false);
  });

  it("recovers expired waiting rooms and releases claims only for durable endings", async () => {
    const f = await roomFixture();

    await ContestRoom.updateOne(
      { _id: f.roomId },
      {
        $set: {
          readyOpensAt: new Date(Date.now() - 2000),
          readyDeadline: new Date(Date.now() - 1000),
        },
      },
    );
    await recoverRoomParticipation();
    expect((await ContestRoom.findById(f.roomId))!.terminationReason).toBe(
      "both_absent",
    );
    await recoverRoomParticipation();
    expect((await ContestRoom.findById(f.roomId))!.status).toBe("ended");
  });
});

describe("participation across workers and registration", () => {
  it("uses the ready deadline when recovery runs after a conflicting match has ended", async () => {
    const shared = id();
    const first = await roomFixture({ members: [[shared], [id()]] });
    const second = await roomFixture({
      members: [
        [shared, id(), id()],
        [id(), id(), id()],
      ],
    });

    await readyOrEnterRoom(second.roomId, String(shared));
    await readyOrEnterRoom(second.roomId, String(second.members[1][0]));
    await startEveryone(first);
    const firstStarted = (await ContestRoom.findById(first.roomId))!;

    await ContestRoom.updateOne(
      { _id: second.roomId },
      { $set: { readyDeadline: firstStarted.actualStartTime } },
    );
    await finishRoomParticipation(first.roomId);
    await readyOrEnterRoom(second.roomId);
    const ended = (await ContestRoom.findById(second.roomId))!;

    expect(ended.terminationReason).toBe("opponent_absent");
    expect(String(ended.winnerTeamId)).toBe(String(second.teams[1]._id));
    expect(ended.admissions).toHaveLength(0);
  });

  it("allows registration for a future contest while a claim is live", async () => {
    const f = await roomFixture();
    const userId = f.members[0][0];

    await CPUser.create({
      userId,
      cfHandle: "future_player",
      cfVerified: true,
    });
    await startEveryone(f);
    const future = await ContestMatch.create({
      name: "Future match",
      creatorId: id(),
      format: "1v1",
      mode: "blitz",
      status: "registration",
      teamSize: 1,
      problemSelectionMode: "test",
      registrationSettings: {
        type: "open",
        deadline: new Date(Date.now() + 60_000),
        maxParticipants: 2,
      },
    });
    const result = await registerContestMember(String(userId), {
      contestId: String(future._id),
    });

    expect(result.ok).toBe(true);
    expect(
      await ContestParticipation.countDocuments({
        _id: userId,
        roomId: f.roomId,
      }),
    ).toBe(1);
  });

  it("rejects pre-admission submissions but processes an admitted user's submission after disconnect", async () => {
    const f = await roomFixture({
      members: [
        [id(), id(), id()],
        [id(), id(), id()],
      ],
      mode: "arena",
    });
    const lateUser = String(f.members[0][1]);
    const data = {
      roomId: f.roomId,
      userId: lateUser,
      teamId: String(f.teams[0]._id),
      cfHandle: "late_player",
      problemId: "100A",
    };
    const process = processors.get("cf_sync_queue")!;

    await readyOrEnterRoom(f.roomId, String(f.members[0][0]));
    await readyOrEnterRoom(f.roomId, String(f.members[1][0]));
    await readyOrEnterRoom(f.roomId, undefined, f.deadline);
    await process({ name: "cf_sync", data, id: "before-entry" });
    expect(fetchCodeforcesUserStatus).not.toHaveBeenCalled();
    const entryTime = Math.ceil((f.deadline + 2000) / 1000) * 1000;

    await readyOrEnterRoom(f.roomId, lateUser, entryTime);
    const submission = (timestamp: number) =>
      ({
        id: timestamp,
        creationTimeSeconds: timestamp / 1000,
        problem: { contestId: 100, index: "A" },
        author: { members: [{ handle: "late_player" }] },
        verdict: "OK",
      }) as CFSubmission;

    vi.mocked(fetchCodeforcesUserStatus).mockResolvedValueOnce([
      submission(entryTime - 1000),
    ]);
    await process({ name: "cf_sync", data, id: "old-submission" });
    expect(
      await redis.zScore(`room:${f.roomId}:scores`, data.teamId),
    ).toBeNull();
    const connection = { userId: lateUser, id: "late-tab", expirySeconds: 45 };

    await updateRoomPresence(f.roomId, "refresh", connection);
    await updateRoomPresence(f.roomId, "remove", connection);
    vi.mocked(fetchCodeforcesUserStatus).mockResolvedValueOnce([
      submission(entryTime + 1000),
    ]);
    await process({ name: "cf_sync", data, id: "after-disconnect" });
    expect(await redis.zScore(`room:${f.roomId}:scores`, data.teamId)).toBe(
      100,
    );
    expect(
      await ContestParticipation.exists({ _id: lateUser, roomId: f.roomId }),
    ).not.toBeNull();
  });

  it("deadline jobs use the same activation path and completed jobs release claims", async () => {
    const f = await roomFixture({
      members: [
        [id(), id(), id()],
        [id(), id(), id()],
      ],
    });

    await readyOrEnterRoom(f.roomId, String(f.members[0][0]));
    await readyOrEnterRoom(f.roomId, String(f.members[1][0]));
    await ContestRoom.updateOne(
      { _id: f.roomId },
      { $set: { readyDeadline: new Date(Date.now() - 1) } },
    );
    const process = processors.get("reconciliation_queue")!;
    const data = { roomId: f.roomId, contestId: String(f.contest._id) };

    await process({ name: "ready_timeout", data, id: "ready" });
    expect(
      await ContestParticipation.countDocuments({ roomId: f.roomId }),
    ).toBe(2);
    await redis.zAdd(`room:${f.roomId}:scores`, {
      score: 100,
      value: String(f.teams[0]._id),
    });
    await process({ name: "room_completed", data, id: "completed" });
    expect((await ContestRoom.findById(f.roomId))!.status).toBe("ended");
    expect(
      await ContestParticipation.countDocuments({ roomId: f.roomId }),
    ).toBe(0);
  });
});

describe("bracket no-shows", () => {
  it("eliminates a lower-bracket no-show without creating another chance", async () => {
    const contest = await bracketFixture();
    const upper = await ContestRoom.find({
      contestId: contest._id,
      status: "waiting",
    });

    for (const room of upper)
      await advanceWinner(
        String(room._id),
        String(contest._id),
        String(room.teams[0]),
      );

    const lower = (await ContestRoom.findOne({
      contestId: contest._id,
      bracketPosition: "lower-0-0",
    }))!;
    const readyTeam = (await ContestTeam.findById(lower.teams[0]))!;
    const absentTeam = (await ContestTeam.findById(lower.teams[1]))!;

    await readyOrEnterRoom(String(lower._id), String(readyTeam.members[0]));
    await readyOrEnterRoom(
      String(lower._id),
      undefined,
      lower.readyDeadline!.getTime(),
    );
    expect((await ContestRoom.findById(lower._id))!.terminationReason).toBe(
      "opponent_absent",
    );
    expect(
      await ContestTeam.countDocuments({ entrantId: absentTeam.entrantId }),
    ).toBe(2);
    expect(lower.loserDestination).toBeUndefined();
  });

  it("activates a reset after the upper finalist misses readiness and can finish with neither side present", async () => {
    const contest = await bracketFixture();
    const contestId = String(contest._id);

    for (let step = 0; step < 8; step++) {
      const rooms = await ContestRoom.find({
        contestId,
        status: "waiting",
        bracketPosition: { $ne: "grand_final-0-0" },
      });

      if (!rooms.length) break;

      for (const room of rooms)
        await advanceWinner(String(room._id), contestId, String(room.teams[0]));
    }

    const final = (await ContestRoom.findOne({
      contestId,
      bracketPosition: "grand_final-0-0",
    }))!;
    const lowerFinalist = (await ContestTeam.findById(
      final.bracketSlots![1].teamId,
    ))!;

    await readyOrEnterRoom(String(final._id), String(lowerFinalist.members[0]));
    await readyOrEnterRoom(
      String(final._id),
      undefined,
      final.readyDeadline!.getTime(),
    );
    const reset = (await ContestRoom.findOne({
      contestId,
      bracketPosition: "grand_final_reset-0-0",
    }))!;

    expect(reset.status).toBe("waiting");
    expect(reset.teams).toHaveLength(2);
    await readyOrEnterRoom(
      String(reset._id),
      undefined,
      reset.readyDeadline!.getTime(),
    );
    expect((await ContestMatch.findById(contestId))!.winnerName).toBe(
      "No Winner",
    );
    expect((await ContestRoom.findById(reset._id))!.terminationReason).toBe(
      "both_absent",
    );
  });

  it("gives an absent upper entrant exactly one loss and keeps its roster in the lower bracket", async () => {
    const contest = await bracketFixture();
    const room = (await ContestRoom.findOne({
      contestId: contest._id,
      status: "waiting",
    }))!;
    const winner = (await ContestTeam.findById(room.teams[0]))!;
    const loser = (await ContestTeam.findById(room.teams[1]))!;

    await readyOrEnterRoom(String(room._id), String(winner.members[0]));
    await Promise.all([
      readyOrEnterRoom(
        String(room._id),
        undefined,
        room.readyDeadline!.getTime(),
      ),
      readyOrEnterRoom(
        String(room._id),
        undefined,
        room.readyDeadline!.getTime(),
      ),
    ]);
    const lower = await ContestTeam.findOne({
      roomId: room.loserDestination!.roomId,
      entrantId: loser.entrantId,
    });

    expect(lower!.bracketLosses).toBe(1);
    expect(lower!.members).toEqual(loser.members);
    expect(lower!.name).toBe(loser.name);
    expect(lower!.isNull).toBe(false);
    expect((await ContestRoom.findById(room._id))!.terminationReason).toBe(
      "opponent_absent",
    );
    expect(
      await ContestTeam.countDocuments({
        roomId: room.loserDestination!.roomId,
        entrantId: loser.entrantId,
      }),
    ).toBe(1);
  });

  it("eliminates both absent sides and propagates empty slots to a no-winner completion", async () => {
    const contest = await bracketFixture();
    const rooms = await ContestRoom.find({
      contestId: contest._id,
      status: "waiting",
    });

    for (const room of rooms)
      await readyOrEnterRoom(
        String(room._id),
        undefined,
        room.readyDeadline!.getTime(),
      );

    expect((await ContestMatch.findById(contest._id))!.status).toBe(
      "completed",
    );
    expect((await ContestMatch.findById(contest._id))!.winnerName).toBe(
      "No Winner",
    );
    expect(
      await ContestRoom.countDocuments({
        contestId: contest._id,
        status: { $ne: "ended" },
      }),
    ).toBe(0);
    expect(await ContestParticipation.countDocuments()).toBe(0);
  });

  it("releases live claims on an audited override or regular bracket advancement", async () => {
    const contest = await bracketFixture();
    const rooms = await ContestRoom.find({
      contestId: contest._id,
      status: "waiting",
    });

    for (const room of rooms) {
      for (const user of room.participants)
        await readyOrEnterRoom(String(room._id), String(user));
    }

    expect(await ContestParticipation.countDocuments()).toBe(4);
    await processWalkover(
      String(rooms[0]._id),
      String(rooms[0].teams[0]),
      "Fixture override",
      String(id()),
    );
    await advanceWinner(
      String(rooms[1]._id),
      String(contest._id),
      String(rooms[1].teams[0]),
    );
    expect(await ContestParticipation.countDocuments()).toBe(0);
    const next = await ContestRoom.find({
      contestId: contest._id,
      status: "waiting",
    });

    expect(next).toHaveLength(2);
    expect(
      next.every((room) => room.readyDeadline!.getTime() > Date.now()),
    ).toBe(true);
  });
});
