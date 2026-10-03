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

import { createRoomContest, registerForContest } from "@/lib/actions/contests";
import { bracketProblemRequirements } from "@/lib/contests/bracketTopology";
import { getBracketSnapshot } from "@/lib/contests/bracket";
import { reconcileMatch } from "@/lib/contests/gameplay";
import { readyOrEnterRoom } from "@/lib/contests/participation";
import { cfSyncQueue, reconciliationQueue } from "@/lib/contests/queues";
import type { ReconciliationJobName } from "@/lib/contests/runtime";
import { getRedis } from "@/lib/db/redis";
import "@/lib/contests/workers/reconciliation";

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

type ReconciliationJob = Awaited<ReturnType<typeof reconciliationQueue.add>>;
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  process: null as null | ((job: ReconciliationJob) => Promise<void>),
}));

vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/contests/queues", async () => {
  const { Queue } = await import("bullmq");
  const { bullMqConnection } = await import("@/lib/queues/bullMq");

  return {
    reconciliationQueue: new Queue(`ccw-test-lifecycle-${process.pid}`, {
      connection: bullMqConnection,
    }),
    cfSyncQueue: new Queue(`ccw-test-lifecycle-cf-${process.pid}`, {
      connection: bullMqConnection,
    }),
  };
});

// Run the real processor explicitly so scheduled jobs cannot race the test clock
vi.mock("bullmq", async (original) => ({
  ...(await original<typeof import("bullmq")>()),
  Worker: class {
    constructor(_name: string, callback: typeof mocks.process) {
      mocks.process = callback;
    }
    on() {
      return this;
    }
  },
}));
vi.mock("@/lib/platforms/problemContent", async (original) => ({
  ...(await original<typeof import("@/lib/platforms/problemContent")>()),
  fetchProblemContentForScheduling: vi.fn(async () => ({
    title: "Lifecycle problem",
    statementHtml: "<p>Solve the fixture</p>",
    inputSpecificationHtml: "",
    outputSpecificationHtml: "",
    samples: [],
    sourceUrl: "https://codeforces.com",
  })),
}));

let redis: Awaited<ReturnType<typeof getRedis>>;

beforeAll(async () => {
  const url = new URL(process.env.REDIS_URL!);

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/15"
  ) {
    throw new Error("Local test Redis DB15 required");
  }

  await startTestMongo();
  redis = await getRedis();
  await Promise.all([
    ContestParticipation.init(),
    ContestProblemSet.init(),
    ContestSubmission.init(),
    CPUser.init(),
  ]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await reconciliationQueue.drain(true);
  await cfSyncQueue.drain(true);

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
  for (const queue of [reconciliationQueue, cfSyncQueue]) {
    await queue.obliterate({ force: true });
    await queue.close();
  }

  redis.destroy();
  await stopTestMongo();
});

async function runJob(name: ReconciliationJobName, contestId: string) {
  const job = await reconciliationQueue.add(name, { contestId });

  await mocks.process!(job);
  await job.remove();
}

describe("complete tournament lifecycle", () => {
  it.each([
    ["single_elimination", "blitz"],
    ["single_elimination", "arena"],
    ["double_elimination", "blitz"],
    ["double_elimination", "arena"],
  ] as const)(
    "plays a five-entrant %s %s bracket from registration to final results",
    async (bracketType, mode) => {
      let now = Math.ceil(Date.now() / 1000) * 1000;
      vi.spyOn(Date, "now").mockImplementation(() => now);
      const start = now + 3_600_000;
      const members = await CPUser.create(
        Array.from({ length: 5 }, (_, index) => ({
          userId: new mongoose.Types.ObjectId(),
          cfHandle: `lifecycle_${index}`,
          cfVerified: true,
          cfRating: 2000 - index * 100,
        })),
      );
      const login = (index: number) =>
        mocks.getSession.mockResolvedValue({
          user: { id: String(members[index].userId), access: "Member" },
        });
      let problemId = 100;
      const slots = bracketProblemRequirements(5, bracketType, 1).flatMap(
        (round) =>
          Array.from({ length: round.problemCount }, () => ({
            platform: "codeforces",
            problemId: `${problemId++}A`,
            points: 250,
            roundNumber: round.roundNumber,
            timeLimitMinutes: 1,
          })),
      );

      login(0);
      expect(
        await createRoomContest({
          name: "Lifecycle tournament",
          format: "bracket",
          mode,
          teamSize: 1,
          entrantCapacity: 5,
          maxParticipants: 5,
          startTime: new Date(start).toISOString(),
          registrationType: "open",
          bracketType,
          problemSelectionMode: "fine-tuned",
          bulkProblemCount: 1,
          overallDurationMinutes: 1,
          perProblemDurationMinutes: 1,
          problemSlots: slots,
        }),
      ).toMatchObject({ ok: true });
      const contest = await ContestMatch.findOne().orFail();
      const contestId = String(contest._id);

      for (let index = 0; index < members.length; index++) {
        login(index);
        expect(await registerForContest(contestId)).toMatchObject({ ok: true });
      }

      now = contest.registrationSettings!.deadline.getTime();
      await runJob("check_start", contestId);
      await runJob("check_start", contestId);
      const generated = await ContestMatch.findById(contestId).orFail();

      expect(
        generated.bracketEntrants!.map((entrant) => entrant.rating),
      ).toEqual([2000, 1900, 1800, 1700, 1600]);
      const byes = await ContestRoom.find({
        contestId,
        bracketPosition: /^upper-0-/,
        resultMethod: "bye",
      });
      const byeTeams = await ContestTeam.find({
        _id: { $in: byes.map((room) => room.winnerTeamId!) },
      }).sort({ seed: 1 });

      expect(byeTeams.map((team) => team.seed)).toEqual([1, 2, 3]);
      expect(
        await ContestProblemSet.countDocuments({
          roomId: { $in: byes.map((room) => room._id) },
        }),
      ).toBe(0);
      expect(
        await readyOrEnterRoom(
          String(
            (
              await ContestRoom.findOne({
                contestId,
                status: "waiting",
              }).orFail()
            )._id,
          ),
          String(members[3].userId),
        ),
      ).toMatchObject({ ok: false });

      await CPUser.updateMany({}, { $set: { cfRating: 0 } });
      now = start;
      await runJob("activate_bracket", contestId);
      const used = new Set<string>();
      let played = 0;
      let resetPlayed = false;

      for (let round = 0; round < 12; round++) {
        const waiting = await ContestRoom.find({
          contestId,
          status: "waiting",
        });
        if (!waiting.length) break;

        for (const room of waiting) {
          for (const user of room.participants) {
            expect(
              await readyOrEnterRoom(String(room._id), String(user)),
            ).toMatchObject({ ok: true });
          }
        }

        now += 10_000;

        for (const room of waiting) {
          const roomId = String(room._id);
          const active = await ContestRoom.findById(roomId).orFail();
          const teams = await ContestTeam.find({ roomId }).sort({ seed: 1 });
          const allocation = await ContestProblemSet.findOne({
            roomId,
          }).orFail();
          const problem = allocation.problems[0];
          const isFinal = room.bracketPosition === "grand_final-0-0";
          const winner = isFinal
            ? teams.find(
                (team) =>
                  String(team._id) === String(room.bracketSlots![1].teamId),
              )!
            : teams[0];

          expect(active.status).toBe("active");
          expect(await ContestParticipation.countDocuments({ roomId })).toBe(2);
          expect(used.has(problem.problemId)).toBe(false);
          used.add(problem.problemId);

          if (mode === "arena") {
            expect(problem.timeLimitMinutes).toBeUndefined();
            expect(active.problemDurationSeconds).toBeUndefined();
            expect(active.problemStates[0].deadlineAt).toBeUndefined();
          }

          expect(
            await reconcileMatch(roomId, {
              teamId: String(winner._id),
              userId: String(winner.members[0]),
              problemId: problem.problemId,
              submissions: [
                {
                  submissionId: `${played + 1}`,
                  submittedAt: now,
                  verdict: "OK",
                },
              ],
            }),
          ).toMatchObject({ accepted: true });
          played++;
          resetPlayed ||= room.bracketPosition === "grand_final_reset-0-0";
        }

        now += 180_000;

        for (const room of waiting) {
          await Promise.all([
            reconcileMatch(String(room._id)),
            reconcileMatch(String(room._id)),
          ]);
          const ended = await ContestRoom.findById(room._id).orFail();

          expect(ended.status).toBe("ended");
          expect(ended.resultMethod).toBe("score");
          expect(
            ended.scoreStats.map((score) => score.score).sort((a, b) => a - b),
          ).toEqual([0, 250]);
          expect(ended.advancementCompletedAt).toBeDefined();
          expect(
            await ContestParticipation.countDocuments({ roomId: room._id }),
          ).toBe(0);
        }
      }

      const completed = await ContestMatch.findById(contestId).orFail();
      const champion = await ContestTeam.findById(completed.winner).orFail();
      const snapshot = await getBracketSnapshot(contestId);

      expect(completed.status).toBe("completed");
      expect(champion.seed).toBe(1);
      expect(champion.frozenRating).toBe(2000);
      expect(played).toBe(bracketType === "double_elimination" ? 9 : 4);
      expect(resetPlayed).toBe(bracketType === "double_elimination");
      expect(
        snapshot.nodes.every(
          (node) => node.status === "completed" || node.status === "bye",
        ),
      ).toBe(true);
      expect(
        await ContestRoom.countDocuments({
          contestId,
          status: { $ne: "ended" },
        }),
      ).toBe(0);
      expect(await ContestParticipation.countDocuments({ contestId })).toBe(0);
      expect(await ContestSubmission.countDocuments({ contestId })).toBe(
        played,
      );
    },
    15_000,
  );
});
