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
  syncUserChallenge: vi.fn(),
  acquireDistributedCodeforcesSlot: vi.fn(),
  getUserSubmissionsSince: vi.fn(),
  getUserSubmissions: vi.fn(),
}));

const redisValues = new Map<string, string>();
const redis = {
  set: vi.fn(
    async (
      key: string,
      value: string,
      options?: { NX?: boolean; EX?: number },
    ) => {
      if (options?.NX && redisValues.has(key)) return null;
      redisValues.set(key, value);
      return "OK";
    },
  ),
  get: vi.fn(async (key: string) => redisValues.get(key) ?? null),
  ttl: vi.fn(async () => 42),
  del: vi.fn(async (...keys: string[]) => {
    let deleted = 0;
    for (const key of keys) {
      if (redisValues.delete(key)) deleted++;
    }
    return deleted;
  }),
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
vi.mock("@/lib/cache", () => ({
  CACHE_TTLS: { LEADERBOARDS: 60 },
  buildCacheKey: vi.fn((prefix: string) => prefix),
  cachedFetch: vi.fn(
    async (_key: string, _ttl: number, loader: () => Promise<unknown>) =>
      loader(),
  ),
}));
vi.mock("@/lib/potd/finalize", () => ({
  syncUserChallenge: mocks.syncUserChallenge,
}));
vi.mock("@/lib/platforms/codeforces", () => ({
  acquireDistributedCodeforcesSlot: mocks.acquireDistributedCodeforcesSlot,
  getUserSubmissionsSince: mocks.getUserSubmissionsSince,
}));
vi.mock("@/lib/platforms/atcoder", () => ({
  getUserSubmissions: mocks.getUserSubmissions,
}));

describe("POTD member actions", () => {
  const userId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    await startTestMongo();
  });

  afterEach(async () => {
    await clearTestMongo();
    redisValues.clear();
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue(memberSession(userId));
    mocks.syncUserChallenge.mockResolvedValue({
      status: "Accepted",
      pointsAwarded: 100,
    });
    mocks.acquireDistributedCodeforcesSlot.mockResolvedValue(true);
    mocks.getUserSubmissionsSince.mockResolvedValue([]);
    mocks.getUserSubmissions.mockResolvedValue([]);
  });

  afterAll(async () => {
    await stopTestMongo();
  });

  it("rejects challenge access without authentication", async () => {
    const { getTodayChallenge } = await import("@/lib/actions/potd");
    mocks.getSession.mockResolvedValueOnce(null);

    await expect(getTodayChallenge()).resolves.toEqual({
      ok: false,
      error: "Unauthorized",
    });
  });

  it("returns active challenges ordered by difficulty with member state", async () => {
    const { getTodayChallenge } = await import("@/lib/actions/potd");
    const setBy = new mongoose.Types.ObjectId();
    const now = new Date();
    const hard = await createActiveChallenge("Hard", 1400, setBy, now);
    const easy = await createActiveChallenge("Easy", 800, setBy, now);
    await POTDSubmission.create({
      userId,
      challengeId: hard._id,
      status: "Accepted",
      solvedAt: now,
      pointsAwarded: 140,
    });

    const result = await getTodayChallenge();

    expect(result.ok).toBe(true);
    expect(
      result.data?.challenges.map((challenge) => challenge.difficulty),
    ).toEqual(["Easy", "Hard"]);
    expect(result.data?.challenges[0].mySubmission.status).toBe("none");
    expect(result.data?.challenges[1].mySubmission).toMatchObject({
      status: "Accepted",
      pointsAwarded: 140,
    });
  });

  it("returns the cached statement and samples only for an active challenge", async () => {
    const now = new Date();
    const problem = await Problem.create({
      platform: "codeforces",
      contestId: "158",
      problemIndex: "A",
      name: "Next Round",
      rating: 800,
      content: {
        title: "A. Next Round",
        statementHtml: "<p>Statement</p>",
        inputSpecificationHtml: "<p>Input</p>",
        outputSpecificationHtml: "<p>Output</p>",
        samples: [{ input: "8 5", output: "6" }],
        sourceUrl: "https://codeforces.com/contest/158/problem/A",
      },
    });
    const challenge = await DailyChallenge.create({
      windowStart: new Date(now.getTime() - 60_000),
      windowEnd: new Date(now.getTime() + 60_000),
      graceEnd: new Date(now.getTime() + 120_000),
      problem: problem._id,
      difficulty: "Easy",
      setBy: new mongoose.Types.ObjectId(),
    });
    const { getSolveChallenge } = await import("@/lib/actions/potd");

    await expect(getSolveChallenge(challenge._id.toString())).resolves.toEqual({
      success: true,
      data: {
        challengeId: challenge._id.toString(),
        platform: "codeforces",
        contestId: "158",
        problemIndex: "A",
        title: "Next Round",
        content: {
          statementHtml: "<p>Statement</p>",
          inputSpecificationHtml: "<p>Input</p>",
          outputSpecificationHtml: "<p>Output</p>",
          constraintsHtml: undefined,
          notesHtml: undefined,
          samples: [{ input: "8 5", output: "6" }],
          timeLimitMs: undefined,
          memoryLimitMb: undefined,
        },
      },
    });
  });

  it("rejects an invalid challenge id before writing a submission", async () => {
    const { markChallengeOpened } = await import("@/lib/actions/potd");

    await expect(markChallengeOpened("not-an-object-id")).resolves.toEqual({
      ok: false,
      error: "Invalid challenge",
    });
    expect(await POTDSubmission.countDocuments()).toBe(0);
  });

  it("requires a verified handle before registering an opened challenge", async () => {
    const { markChallengeOpened } = await import("@/lib/actions/potd");
    const challenge = await createActiveChallenge(
      "Easy",
      800,
      new mongoose.Types.ObjectId(),
      new Date(),
    );

    await expect(
      markChallengeOpened(challenge._id.toString()),
    ).resolves.toEqual({
      ok: false,
      error: "Codeforces handle not verified",
    });
  });

  it("registers an opened challenge once even when called repeatedly", async () => {
    const { markChallengeOpened } = await import("@/lib/actions/potd");
    await CPUser.create({ userId, cfVerified: true });
    const challenge = await createActiveChallenge(
      "Easy",
      800,
      new mongoose.Types.ObjectId(),
      new Date(),
    );

    expect(await markChallengeOpened(challenge._id.toString())).toEqual({
      ok: true,
    });
    expect(await markChallengeOpened(challenge._id.toString())).toEqual({
      ok: true,
    });
    expect(
      await POTDSubmission.countDocuments({
        userId,
        challengeId: challenge._id,
      }),
    ).toBe(1);
  });

  it("enforces the per-member sync rate limit", async () => {
    const { syncMySubmission } = await import("@/lib/actions/potd");
    const challenge = await verifiedChallenge(userId);
    redisValues.set(`potd:sync:ratelimit:${userId}`, "1");

    await expect(syncMySubmission(challenge._id.toString())).resolves.toEqual({
      ok: false,
      error: "Please wait 42s before syncing again",
    });
  });

  it("releases the rate limit when another sync already holds the advisory lock", async () => {
    const { syncMySubmission } = await import("@/lib/actions/potd");
    const challenge = await verifiedChallenge(userId);
    redisValues.set(
      `potd:sync:lock:${userId}:${challenge._id.toString()}`,
      "1",
    );

    await expect(syncMySubmission(challenge._id.toString())).resolves.toEqual({
      ok: false,
      error: "Sync already in progress",
    });
    expect(redisValues.has(`potd:sync:ratelimit:${userId}`)).toBe(false);
  });

  it("backs off and releases both member locks while cron owns the challenge", async () => {
    const { syncMySubmission } = await import("@/lib/actions/potd");
    const challenge = await verifiedChallenge(userId);
    redisValues.set(`potd:cron:lock:${challenge._id.toString()}`, "1");

    await expect(syncMySubmission(challenge._id.toString())).resolves.toEqual({
      ok: false,
      error: "Auto-sync is running. Your result will be updated shortly.",
    });
    expect(redisValues.has(`potd:sync:ratelimit:${userId}`)).toBe(false);
    expect(
      redisValues.has(`potd:sync:lock:${userId}:${challenge._id.toString()}`),
    ).toBe(false);
  });

  it("returns a safe platform error and releases the advisory lock", async () => {
    const { syncMySubmission } = await import("@/lib/actions/potd");
    const challenge = await verifiedChallenge(userId);
    mocks.getUserSubmissionsSince.mockRejectedValueOnce(
      new Error("provider details"),
    );

    await expect(syncMySubmission(challenge._id.toString())).resolves.toEqual({
      ok: false,
      error: "Failed to reach Codeforces API",
    });
    expect(
      redisValues.has(`potd:sync:lock:${userId}:${challenge._id.toString()}`),
    ).toBe(false);
  });

  it("syncs through the scoring service and retains only the rate-limit key", async () => {
    const { syncMySubmission } = await import("@/lib/actions/potd");
    const challenge = await verifiedChallenge(userId);
    mocks.getUserSubmissionsSince.mockResolvedValueOnce([
      { verdict: "OK", problem: { contestId: 1, index: "A" } },
    ]);

    await expect(syncMySubmission(challenge._id.toString())).resolves.toEqual({
      ok: true,
      status: "Accepted",
      pointsAwarded: 100,
    });
    expect(redisValues.has(`potd:sync:ratelimit:${userId}`)).toBe(true);
    expect(
      redisValues.has(`potd:sync:lock:${userId}:${challenge._id.toString()}`),
    ).toBe(false);
  });

  it("returns persisted member totals and solved challenge history", async () => {
    const { getMyPotdStats } = await import("@/lib/actions/potd");
    await CPUser.create({
      userId,
      potdTotalPoints: 325,
      potdTotalSolved: 3,
      potdCurrentStreak: 2,
      potdLongestStreak: 4,
    });
    const challenge = await createActiveChallenge(
      "Hard",
      1400,
      new mongoose.Types.ObjectId(),
      new Date(),
    );
    await POTDSubmission.create({
      userId,
      challengeId: challenge._id,
      status: "Accepted",
      solvedAt: new Date("2026-07-30T10:00:00.000Z"),
      pointsAwarded: 140,
    });

    const result = await getMyPotdStats();

    expect(result).toMatchObject({
      ok: true,
      data: {
        totalPoints: 325,
        totalSolved: 3,
        currentStreak: 2,
        longestStreak: 4,
        recentSubmissions: [
          {
            status: "Accepted",
            pointsAwarded: 140,
            problem: { name: "Hard active fixture", rating: 1400 },
          },
        ],
      },
    });
  });

  it("searches finalized problems literally and reports solve counts", async () => {
    const { getPastProblems } = await import("@/lib/actions/potd");
    const problem = await Problem.create({
      platform: "codeforces",
      contestId: "999",
      problemIndex: "A",
      name: "A+B literal",
      rating: 900,
    });
    const windows = computeWindowTimes("2026-07-20");
    const challenge = await DailyChallenge.create({
      ...windows,
      problem: problem._id,
      difficulty: "Medium",
      setBy: new mongoose.Types.ObjectId(),
    });
    await POTDSubmission.create({
      userId,
      challengeId: challenge._id,
      status: "Late",
      pointsAwarded: 45,
    });

    const result = await getPastProblems(1, 10, "A+B");

    expect(result).toMatchObject({
      ok: true,
      total: 1,
      data: [
        {
          difficulty: "Medium",
          solvedBy: 1,
          problem: { name: "A+B literal" },
        },
      ],
    });
  });

  it("orders the points leaderboard by earned points", async () => {
    const { getPotdLeaderboard } = await import("@/lib/actions/potd");
    const firstUser = await User.create({
      name: "First",
      codeforcesId: "first_cf",
    });
    const secondUser = await User.create({
      name: "Second",
      atcoderId: "second_ac",
    });
    await CPUser.create([
      { userId: firstUser._id, potdCurrentStreak: 2 },
      { userId: secondUser._id, potdCurrentStreak: 5 },
    ]);
    const challenge = await createActiveChallenge(
      "Easy",
      800,
      new mongoose.Types.ObjectId(),
      new Date(),
    );
    await POTDSubmission.create([
      {
        userId: firstUser._id,
        challengeId: challenge._id,
        status: "Accepted",
        solvedAt: new Date(),
        pointsAwarded: 120,
      },
      {
        userId: secondUser._id,
        challengeId: challenge._id,
        status: "Late",
        solvedAt: new Date(),
        pointsAwarded: 40,
      },
    ]);

    const result = await getPotdLeaderboard("weekly");

    expect(result.data?.map((entry) => entry.name)).toEqual([
      "First",
      "Second",
    ]);
    expect(result.data?.map((entry) => entry.totalPoints)).toEqual([120, 40]);
  });
});

function memberSession(userId: mongoose.Types.ObjectId) {
  return {
    user: {
      id: userId.toString(),
      name: "POTD Member",
      email: "potd-member@example.test",
      role: "Member",
      codeforcesId: "tourist",
      atcoderId: "",
    },
    session: {
      id: "session-1",
      userId: userId.toString(),
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  };
}

async function createActiveChallenge(
  difficulty: "Easy" | "Medium" | "Hard",
  rating: number,
  setBy: mongoose.Types.ObjectId,
  now: Date,
) {
  const problem = await Problem.create({
    platform: "codeforces",
    contestId: `${difficulty}-${rating}-${new mongoose.Types.ObjectId()}`,
    problemIndex: difficulty.slice(0, 1),
    name: `${difficulty} active fixture`,
    rating,
  });
  return DailyChallenge.create({
    windowStart: new Date(now.getTime() - 60_000),
    windowEnd: new Date(now.getTime() + 60_000),
    graceEnd: new Date(now.getTime() + 120_000),
    problem: problem._id,
    difficulty,
    setBy,
  });
}

async function verifiedChallenge(userId: mongoose.Types.ObjectId) {
  await CPUser.create({ userId, cfVerified: true });
  return createActiveChallenge(
    "Easy",
    1000,
    new mongoose.Types.ObjectId(),
    new Date(),
  );
}
