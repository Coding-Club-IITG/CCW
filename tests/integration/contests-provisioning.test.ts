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
  bracketProblemRequirements,
  buildBracketTopology,
} from "@/lib/contests/bracketTopology";
import { problemAllocationError } from "@/lib/contests/problemAllocation";
import {
  createProvisionedRoom,
  provisionProblems,
} from "@/lib/contests/provisioning";
import { contestCreationPayloadSchema } from "@/lib/api/schemas/contestAction";

import ContestMatch from "@/models/ContestMatch";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestQuestion from "@/models/ContestQuestion";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";

import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

vi.mock("@/lib/platforms/problemContent", async (original) => ({
  ...(await original<typeof import("@/lib/platforms/problemContent")>()),
  fetchProblemContentForScheduling: vi.fn(
    async (_platform: string, contestId: string, index: string) => ({
      title: `${contestId}${index} hydrated`,
      statementHtml: "<p>Statement</p>",
      inputSpecificationHtml: "<p>Input</p>",
      outputSpecificationHtml: "<p>Output</p>",
      samples: [{ input: "1", output: "2" }],
      sourceUrl: "https://codeforces.com",
    }),
  ),
}));

const id = () => new mongoose.Types.ObjectId();

beforeAll(async () => {
  await startTestMongo();
  await ContestProblemSet.init();
});
afterEach(clearTestMongo);
afterAll(stopTestMongo);

function manualConfig(
  capacity = 8,
  type: "single_elimination" | "double_elimination" = "double_elimination",
) {
  let counter = 100;
  const problemSlots = bracketProblemRequirements(capacity, type, 2).flatMap(
    (round) =>
      Array.from({ length: round.problemCount }, () => ({
        platform: "codeforces",
        problemId: `${counter++}A`,
        roundNumber: round.roundNumber,
        points: 180,
        timeLimitMinutes: 2,
      })),
  );

  return {
    name: "Manual",
    creatorId: id(),
    format: "bracket" as const,
    mode: "blitz" as const,
    status: "provisioning" as const,
    problemSelectionMode: "fine-tuned" as const,
    bulkProblemCount: 2,
    entrantCapacity: capacity,
    bracketType: type,
    registrationSettings: {
      type: "open" as const,
      deadline: new Date(),
      maxParticipants: capacity,
      entrantCapacity: capacity,
    },
    bracketSettings: { type },
    problemSlots,
  };
}

describe("complete problem provisioning", () => {
  it("validates lower and reset allocations and case-insensitive freshness in client and payload validation", () => {
    const config = manualConfig();

    expect(problemAllocationError(config)).toBeNull();
    expect(
      problemAllocationError({
        ...config,
        problemSlots: config.problemSlots.slice(0, -1),
      }),
    ).toMatch(/Reset/);
    const duplicated = [...config.problemSlots];

    duplicated[duplicated.length - 1] = {
      ...duplicated.at(-1)!,
      problemId: duplicated[0].problemId.toLowerCase(),
    };
    expect(
      problemAllocationError({ ...config, problemSlots: duplicated }),
    ).toMatch(/more than once/);
    const payload = {
      ...config,
      teamSize: 1,
      maxParticipants: 8,
      startTime: new Date(Date.now() + 600_000).toISOString(),
      registrationType: "open",
    };

    expect(contestCreationPayloadSchema.safeParse(payload).success).toBe(true);
    expect(
      contestCreationPayloadSchema.safeParse({
        ...payload,
        problemSlots: config.problemSlots.slice(0, -1),
      }).success,
    ).toBe(false);
  });

  it("retains final and reset reserves when actual entrants shrink across a power of two", async () => {
    const config = manualConfig(8);
    const contest = await ContestMatch.create(config);
    const topology = buildBracketTopology(4, "double_elimination");
    const allocations = await provisionProblems(contest, new Set(), topology);
    const requirements = bracketProblemRequirements(8, "double_elimination", 2);

    for (const stage of ["grand_final", "grand_final_reset"] as const) {
      const configured = requirements.find((round) => round.stage === stage)!;
      const ids = config.problemSlots
        .filter((slot) => slot.roundNumber === configured.roundNumber)
        .map((slot) => slot.problemId);

      expect(
        allocations.get(`${stage}-0-0`)!.map((problem) => problem.problemId),
      ).toEqual(ids);
    }

    const used = [...allocations.values()]
      .flat()
      .map((problem) => problem.problemId);

    expect(new Set(used).size).toBe(used.length);
    expect(allocations.get("upper-1-0")![0]).toMatchObject({
      points: 180,
      timeLimitMinutes: 2,
      statementHtml: "<p>Statement</p>",
      samples: [{ input: "1", output: "2" }],
    });
  });

  it("allocates no problems to odd-bracket byes", async () => {
    const contest = await ContestMatch.create(
      manualConfig(5, "single_elimination"),
    );
    const topology = buildBracketTopology(5, "single_elimination");
    const allocation = await provisionProblems(contest, new Set(), topology);

    expect(allocation.size).toBe(4);
    expect(
      topology.matches
        .filter((match) => !match.playable)
        .every((match) => !allocation.has(match.position)),
    ).toBe(true);
  });

  it("preserves direct manual scoring, timers and hydrated statements in one idempotent room", async () => {
    const contest = await ContestMatch.create({
      name: "Direct",
      creatorId: id(),
      format: "1v1",
      mode: "blitz",
      status: "provisioning",
      problemSelectionMode: "fine-tuned",
      overallDurationMinutes: 17,
      perProblemDurationMinutes: 4,
      problemSlots: [
        {
          platform: "codeforces",
          problemId: "4a",
          points: 250,
          timeLimitMinutes: 2,
        },
      ],
    });
    const problems = (await provisionProblems(contest, new Set())).get("room")!;
    const teams = [0, 1].map((index) => ({
      name: `Team ${index}`,
      members: [String(id())],
    }));
    const [first, second] = await Promise.all([
      createProvisionedRoom(String(contest._id), teams, problems, "waiting"),
      createProvisionedRoom(String(contest._id), teams, problems, "waiting"),
    ]);

    expect(String(first._id)).toBe(String(second._id));
    expect(first.durationSeconds).toBe(17 * 60);
    expect(first.problemDurationSeconds).toBe(4 * 60);
    expect(await ContestRoom.countDocuments()).toBe(1);
    expect(await ContestTeam.countDocuments()).toBe(2);
    expect(
      (await ContestProblemSet.findOne({ roomId: first._id }))!.problems[0],
    ).toMatchObject({
      problemId: "4A",
      points: 250,
      timeLimitMinutes: 2,
      name: "4A hydrated",
    });
  });

  it("rejects shortages including the reset before writing rooms or allocations", async () => {
    await ContestQuestion.create(
      Array.from({ length: 6 }, (_, index) => ({
        problemId: `${100 + index}A`,
        contestId: 100 + index,
        index: "A",
        name: `Problem ${index}`,
        rating: 1000,
      })),
    );
    const contest = await ContestMatch.create({
      ...manualConfig(4),
      problemSelectionMode: "bulk",
      bulkProblemCount: 1,
    });

    await expect(
      provisionProblems(
        contest,
        new Set(),
        buildBracketTopology(4, "double_elimination"),
      ),
    ).rejects.toThrow(/Not enough fresh/);
    expect(await ContestProblemSet.countDocuments()).toBe(0);
    expect(await ContestRoom.countDocuments()).toBe(0);
  });

  it("excludes solved bulk questions and strips Arena problem timers", async () => {
    await ContestQuestion.create(
      [100, 101, 102].map((contestId) => ({
        problemId: `${contestId}A`,
        contestId,
        index: "A",
        name: "Question",
        rating: 1000,
      })),
    );
    const contest = await ContestMatch.create({
      name: "Bulk",
      creatorId: id(),
      format: "1v1",
      mode: "arena",
      problemSelectionMode: "bulk",
      bulkProblemCount: 2,
      bulkMinContestId: 100,
    });
    const selected = (await provisionProblems(contest, new Set(["100A"]))).get(
      "room",
    )!;

    expect(selected.map((problem) => problem.problemId).sort()).toEqual([
      "101A",
      "102A",
    ]);
    contest.problemSelectionMode = "fine-tuned";
    contest.problemSlots = [
      {
        platform: "codeforces",
        problemId: "100A",
        points: 300,
        timeLimitMinutes: 1,
      },
    ];
    expect(
      (await provisionProblems(contest, new Set())).get("room")![0]
        .timeLimitMinutes,
    ).toBeUndefined();
  });
});
