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

import { computeWindowTimes } from "@/lib/potd/utils";
import CPUser from "@/models/CPUser";
import ContestQuestion from "@/models/ContestQuestion";
import DailyChallenge from "@/models/POTDDailyChallenge";
import Problem from "@/models/POTDProblem";
import POTDSubmission from "@/models/POTDSubmission";
import User from "@/models/User";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  revalidatePath: vi.fn(),
  getProblems: vi.fn(),
  getProblemById: vi.fn(),
  getUserSubmissionsSince: vi.fn(),
  syncUserChallenge: vi.fn(),
  fetchProblemContent: vi.fn(),
}));

let cachedProblems: unknown[] | null = null;
const redis = {
  get: vi.fn(async () =>
    cachedProblems ? JSON.stringify(cachedProblems) : null,
  ),
  set: vi.fn(async () => "OK"),
};

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(async () => redis),
}));
vi.mock("@ronits2407/cp-api", () => ({
  cp: { codeforces: { getProblems: mocks.getProblems } },
}));
vi.mock("@/lib/platforms/atcoder", () => ({
  getProblemById: mocks.getProblemById,
  getUserSubmissions: vi.fn(),
}));
vi.mock("@/lib/platforms/codeforces", () => ({
  getUserSubmissionsSince: mocks.getUserSubmissionsSince,
}));
vi.mock("@/lib/platforms/problemContent", () => ({
  fetchProblemContent: mocks.fetchProblemContent,
}));
vi.mock("@/lib/potd/finalize", () => ({
  syncUserChallenge: mocks.syncUserChallenge,
}));

describe("POTD administration actions", () => {
  const adminId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await startTestMongo();
  });

  afterEach(async () => {
    await clearTestMongo();
    vi.useRealTimers();
    vi.clearAllMocks();
    cachedProblems = [
      {
        contestId: 158,
        index: "A",
        name: "Next Round",
        rating: 800,
        tags: ["implementation"],
      },
      {
        contestId: 4,
        index: "A",
        name: "Watermelon",
        rating: 800,
        tags: ["math"],
      },
    ];
    mocks.getSession.mockResolvedValue(adminSession(adminId));
    mocks.getUserSubmissionsSince.mockResolvedValue([]);
    mocks.syncUserChallenge.mockResolvedValue({
      status: "Accepted",
      pointsAwarded: 100,
    });
    mocks.fetchProblemContent.mockResolvedValue({
      title: "Fetched problem",
      statementHtml: "<p>Statement</p>",
      inputSpecificationHtml: "<p>Input</p>",
      outputSpecificationHtml: "<p>Output</p>",
      samples: [{ input: "1", output: "2" }],
      sourceUrl: "https://example.test/problem",
    });
  });

  afterAll(async () => {
    await stopTestMongo();
  });

  it("forbids POTD scheduling for a regular member", async () => {
    const { setDailyProblem } = await import("@/lib/actions/admin/potd");
    mocks.getSession.mockResolvedValueOnce({
      ...adminSession(adminId),
      user: { ...adminSession(adminId).user, access: "Member", roles: "[]" },
    });

    await expect(
      setDailyProblem("2026-07-31", "158A", "Easy"),
    ).resolves.toEqual({ ok: false, error: "Forbidden" });
  });

  it("rejects invalid, past, and overly distant schedule dates", async () => {
    const { setDailyProblem } = await import("@/lib/actions/admin/potd");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));

    await expect(
      setDailyProblem("2026-02-30", "158A", "Easy"),
    ).resolves.toEqual({ ok: false, error: "Invalid date value" });
    await expect(
      setDailyProblem("2026-07-29", "158A", "Easy"),
    ).resolves.toEqual({
      ok: false,
      error: "Cannot schedule problems for past dates",
    });
    await expect(
      setDailyProblem("2026-08-10", "158A", "Easy"),
    ).resolves.toEqual({
      ok: false,
      error: "Cannot schedule more than 10 days in advance",
    });
  });

  it("rejects malformed Codeforces problem identifiers", async () => {
    const { setDailyProblem } = await import("@/lib/actions/admin/potd");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));

    await expect(
      setDailyProblem("2026-07-31", "not-a-problem", "Easy"),
    ).resolves.toEqual({
      ok: false,
      error: "Invalid CF Problem ID. Use format like '158A' or '1234B1'.",
    });
  });

  it("schedules a Codeforces problem from the isolated cache", async () => {
    const { setDailyProblem } = await import("@/lib/actions/admin/potd");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));

    await expect(
      setDailyProblem("2026-07-31", "158a", "Easy"),
    ).resolves.toEqual({ ok: true });

    const problem = await Problem.findOne({
      platform: "codeforces",
      contestId: "158",
      problemIndex: "A",
    }).lean();
    const challenge = await DailyChallenge.findOne({
      difficulty: "Easy",
    }).lean();
    expect(problem).toMatchObject({
      name: "Next Round",
      rating: 800,
      tags: ["implementation"],
      content: {
        statementHtml: "<p>Statement</p>",
        samples: [{ input: "1", output: "2" }],
      },
    });
    expect(challenge).toMatchObject(computeWindowTimes("2026-07-31"));
  });

  it("prevents duplicate difficulty slots and flags problem reuse", async () => {
    const { setDailyProblem } = await import("@/lib/actions/admin/potd");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));
    await setDailyProblem("2026-07-31", "158A", "Easy");

    await expect(setDailyProblem("2026-07-31", "4A", "Easy")).resolves.toEqual({
      ok: false,
      error: "A Easy problem is already set for this date",
    });
    await expect(
      setDailyProblem("2026-08-01", "158A", "Hard"),
    ).resolves.toMatchObject({
      ok: false,
      reuse: true,
    });
  });

  it("schedules an AtCoder problem without making a live API request", async () => {
    const { setDailyProblem } = await import("@/lib/actions/admin/potd");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));
    mocks.getProblemById.mockResolvedValueOnce({
      problem: {
        contest_id: "abc123",
        id: "abc123_a",
        name: "Five Antennas",
      },
      difficulty: 900,
    });

    await expect(
      setDailyProblem("2026-07-31", "abc123/a", "Medium", "atcoder"),
    ).resolves.toEqual({ ok: true });
    expect(
      await Problem.findOne({ platform: "atcoder", problemIndex: "abc123_a" }),
    ).toMatchObject({ contestId: "abc123", rating: 900 });
    expect(mocks.fetchProblemContent).toHaveBeenCalledWith(
      "atcoder",
      "abc123",
      "abc123_a",
    );
  });

  it("still schedules when public problem content is unavailable", async () => {
    const { setDailyProblem } = await import("@/lib/actions/admin/potd");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));
    mocks.fetchProblemContent.mockRejectedValueOnce(new Error("blocked"));

    await expect(
      setDailyProblem("2026-07-31", "158A", "Easy"),
    ).resolves.toEqual({ ok: true });
    expect(await Problem.findOne({ contestId: "158" }).lean()).toMatchObject({
      content: null,
    });
  });

  it("does not delete an ended challenge but deletes a future one", async () => {
    const { deleteScheduledChallenge } =
      await import("@/lib/actions/admin/potd");
    const problem = await Problem.create({
      platform: "codeforces",
      contestId: "158",
      problemIndex: "A",
      name: "Next Round",
      rating: 800,
    });
    const ended = await DailyChallenge.create({
      ...computeWindowTimes("2026-07-28"),
      problem: problem._id,
      difficulty: "Easy",
      setBy: adminId,
    });
    const future = await DailyChallenge.create({
      ...computeWindowTimes("2026-08-01"),
      problem: problem._id,
      difficulty: "Hard",
      setBy: adminId,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));

    await expect(
      deleteScheduledChallenge(ended._id.toString()),
    ).resolves.toEqual({
      ok: false,
      error: "Cannot delete a challenge that has already ended",
    });
    await expect(
      deleteScheduledChallenge(future._id.toString()),
    ).resolves.toEqual({ ok: true });
    expect(await DailyChallenge.findById(ended._id)).not.toBeNull();
    expect(await DailyChallenge.findById(future._id)).toBeNull();
  });

  it("lists scheduled challenges in chronological order", async () => {
    const { getScheduledChallenges } = await import("@/lib/actions/admin/potd");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));
    await seedChallenge("2026-08-01", "Hard", adminId);
    await seedChallenge("2026-07-30", "Easy", adminId);

    const result = await getScheduledChallenges();

    expect(
      result.data?.map((entry) => [entry.dateStr, entry.difficulty]),
    ).toEqual([
      ["2026-07-30", "Easy"],
      ["2026-08-01", "Hard"],
    ]);
    expect(result.data?.[0].isToday).toBe(true);
  });

  it("lists pending member submissions with safe display fields", async () => {
    const { getPendingSubmissions } = await import("@/lib/actions/admin/potd");
    const member = await User.create({
      name: "Pending Member",
      codeforcesId: "pending_cf",
    });
    const challenge = await seedChallenge("2026-08-01", "Easy", adminId);
    await POTDSubmission.create({
      userId: member._id,
      challengeId: challenge._id,
      status: "Pending",
      lastCheckedAt: new Date("2026-07-30T05:00:00.000Z"),
    });

    const result = await getPendingSubmissions(challenge._id.toString());

    expect(result.data).toEqual([
      expect.objectContaining({
        userId: member._id.toString(),
        userName: "Pending Member",
        codeforcesId: "pending_cf",
        status: "Pending",
        lastCheckedAt: "2026-07-30T05:00:00.000Z",
      }),
    ]);
  });

  it("force-syncs only users with verified platform handles", async () => {
    const { forceSyncUser } = await import("@/lib/actions/admin/potd");
    const member = await User.create({
      name: "Verified Member",
      codeforcesId: "verified_cf",
    });
    const challenge = await seedChallenge("2026-08-01", "Easy", adminId);

    await expect(
      forceSyncUser(member._id.toString(), challenge._id.toString()),
    ).resolves.toEqual({
      ok: false,
      error: "User's CF handle not verified",
    });

    await CPUser.create({ userId: member._id, cfVerified: true });
    await expect(
      forceSyncUser(member._id.toString(), challenge._id.toString()),
    ).resolves.toEqual({ ok: true, status: "Accepted" });
  });

  it("selects unused automatic candidates within each slot's constraints", async () => {
    const { autoFetchPOTDCandidates } =
      await import("@/lib/actions/admin/potd");
    await ContestQuestion.create([
      {
        problemId: "200A",
        contestId: 200,
        index: "A",
        name: "Candidate",
        rating: 900,
        tags: ["math"],
      },
      {
        problemId: "100A",
        contestId: 100,
        index: "A",
        name: "Too old",
        rating: 900,
        tags: [],
      },
    ]);

    const result = await autoFetchPOTDCandidates(
      [
        {
          id: "slot-1",
          dateStr: "2026-08-01",
          difficulty: "Easy",
          ratingMin: 800,
          ratingMax: 1000,
          minContestId: 150,
        },
      ],
      ["100A"],
    );

    expect(result).toMatchObject({
      ok: true,
      candidates: [
        {
          id: "slot-1",
          problem: { problemId: "200A", rating: 900 },
        },
      ],
    });
  });

  it("bulk scheduling reports partial success without hiding item failures", async () => {
    const { bulkSetDailyProblems } = await import("@/lib/actions/admin/potd");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T06:00:00.000Z"));

    const result = await bulkSetDailyProblems([
      {
        dateStr: "2026-07-31",
        difficulty: "Easy",
        problemId: "158A",
        platform: "codeforces",
      },
      {
        dateStr: "2026-07-31",
        difficulty: "Hard",
        problemId: "invalid",
        platform: "codeforces",
      },
    ]);

    expect(result).toMatchObject({ ok: true, count: 1 });
    expect(result.error).toContain("Failed to set Hard for 2026-07-31");
  });
});

function adminSession(adminId: mongoose.Types.ObjectId) {
  return {
    user: {
      id: adminId.toString(),
      name: "POTD Admin",
      email: "potd-admin@example.test",
      access: "Member",
      roles: JSON.stringify([
        { module: "Competitive Programming", position: "Core Team" },
      ]),
    },
    session: {
      id: "admin-session",
      userId: adminId.toString(),
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  };
}

async function seedChallenge(
  date: string,
  difficulty: "Easy" | "Medium" | "Hard",
  setBy: mongoose.Types.ObjectId,
) {
  const problem = await Problem.create({
    platform: "codeforces",
    contestId: `${date}-${difficulty}`,
    problemIndex: difficulty.slice(0, 1),
    name: `${difficulty} scheduled fixture`,
    rating: 1000,
  });
  return DailyChallenge.create({
    ...computeWindowTimes(date),
    problem: problem._id,
    difficulty,
    setBy,
  });
}
