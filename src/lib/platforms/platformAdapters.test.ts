import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redisSet: vi.fn(),
  healthCheck: vi.fn(),
  atcoder: {
    getContestProblems: vi.fn(),
    getProblemDifficulties: vi.fn(),
    getProblem: vi.fn(),
    getUserSubmissions: vi.fn(),
    getUser: vi.fn(),
    getRankFromRating: vi.fn(),
    getUserAffiliation: vi.fn(),
  },
  codeforces: {
    getSubmissionsSince: vi.fn(),
  },
}));

vi.mock("@ronits2407/cp-api", () => ({
  cp: {
    atcoder: mocks.atcoder,
    codeforces: mocks.codeforces,
    health: { check: mocks.healthCheck },
  },
}));

vi.mock("@/lib/redis", () => ({
  getRedis: vi.fn(async () => ({ set: mocks.redisSet })),
}));

vi.mock("@/lib/cache", () => ({
  cachedFetch: vi.fn(
    async (_key: string, _ttl: number, fetcher: () => Promise<unknown>) =>
      fetcher(),
  ),
}));

vi.mock("@/lib/utils", () => ({
  logger: { warn: vi.fn() },
  errorToLogMetadata: vi.fn(() => ({})),
}));

import {
  getProblemById,
  getUserInfo,
  getUserSubmissions,
  isAtCoderAPIReachable,
} from "@/lib/platforms/atcoder";
import {
  acquireDistributedCodeforcesSlot,
  getUserSubmissionsSince,
} from "@/lib/platforms/codeforces";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("platform adapters", () => {
  it("maps the SDK AtCoder problem shape to CCW's existing contract", async () => {
    const problem = {
      id: "abc100_a",
      contest_id: "abc100",
      problem_index: "A",
      name: "Happy Birthday!",
      title: "A - Happy Birthday!",
      difficulty: 42,
    };
    mocks.atcoder.getProblem.mockResolvedValue(problem);

    await expect(getProblemById("abc100_a")).resolves.toEqual({
      problem: {
        id: "abc100_a",
        contest_id: "abc100",
        problem_index: "A",
        name: "Happy Birthday!",
        title: "A - Happy Birthday!",
      },
      difficulty: 42,
    });
  });

  it("delegates AtCoder submission filtering to CP-API", async () => {
    mocks.atcoder.getUserSubmissions.mockResolvedValue([]);
    await getUserSubmissions("tourist", 123);
    expect(mocks.atcoder.getUserSubmissions).toHaveBeenCalledWith("tourist", {
      fromSecond: 123,
    });
  });

  it("preserves null-returning AtCoder user lookup failures", async () => {
    mocks.atcoder.getUser.mockRejectedValue(new Error("offline"));
    await expect(getUserInfo("tourist")).resolves.toBeNull();
  });

  it("uses the unified AtCoder health check", async () => {
    mocks.healthCheck.mockResolvedValue([{ reachable: true }]);
    await expect(isAtCoderAPIReachable()).resolves.toBe(true);
    expect(mocks.healthCheck).toHaveBeenCalledWith("ATCODER");
  });

  it("uses one shared Redis request slot for interactive Codeforces calls", async () => {
    mocks.redisSet.mockResolvedValue("OK");
    await expect(acquireDistributedCodeforcesSlot()).resolves.toBe(true);
    expect(mocks.redisSet).toHaveBeenCalledWith(
      "ccw:platform:codeforces:request-slot",
      "1",
      { NX: true, EX: 2 },
    );
  });

  it("delegates Codeforces pagination and timing to CP-API", async () => {
    mocks.codeforces.getSubmissionsSince.mockResolvedValue([]);
    await getUserSubmissionsSince("tourist", 456);
    expect(mocks.codeforces.getSubmissionsSince).toHaveBeenCalledWith(
      "tourist",
      456,
    );
  });
});
