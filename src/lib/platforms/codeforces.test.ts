import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  getSubmissions: vi.fn(),
  getSubmissionsSince: vi.fn(),
}));

vi.mock("@ronits2407/cp-api", () => ({ cp: { codeforces: sdk } }));
vi.mock("@/lib/telemetry/logger", () => ({
  logger: { debug: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("DEV_MOCK_CF_SUBMISSIONS", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("shared Codeforces development submissions", () => {
  it("returns a stable accepted submission for a targeted status query", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05Z"));
    const { fetchCodeforcesUserStatus } = await import("./codeforces");

    const submissions = await fetchCodeforcesUserStatus(
      "test_handle",
      100,
      1,
      "123A1",
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      creationTimeSeconds: Date.now() / 1000,
      problem: { contestId: 123, index: "A1" },
      author: { members: [{ handle: "test_handle" }] },
      verdict: "OK",
    });
    expect(
      await fetchCodeforcesUserStatus("test_handle", 1, 1, "123A1"),
    ).toEqual(submissions);
    expect(sdk.getSubmissions).not.toHaveBeenCalled();
  });

  it("does not invent submissions for untargeted queries or later pages", async () => {
    const {
      fetchCodeforcesUserStatus,
      getUserSubmissions,
      getUserSubmissionsSince,
    } = await import("./codeforces");

    await expect(getUserSubmissions("test_handle")).resolves.toEqual([]);
    await expect(getUserSubmissionsSince("test_handle", 1000)).resolves.toEqual(
      [],
    );
    await expect(
      fetchCodeforcesUserStatus("test_handle", 0, 1, "123A"),
    ).resolves.toEqual([]);
    await expect(
      fetchCodeforcesUserStatus("test_handle", 100, 2, "123A"),
    ).resolves.toEqual([]);
    expect(sdk.getSubmissions).not.toHaveBeenCalled();
    expect(sdk.getSubmissionsSince).not.toHaveBeenCalled();
  });

  it("preserves the POTD since-time contract without a platform request", async () => {
    const { getUserSubmissionsSince } = await import("./codeforces");
    const since = Date.parse("2026-01-02T03:04:05Z");

    const submissions = await getUserSubmissionsSince(
      "test_handle",
      since,
      "4A",
    );
    expect(submissions).toHaveLength(1);
    expect(submissions[0]).toMatchObject({
      creationTimeSeconds: (since + 1000) / 1000,
      problem: { contestId: 4, index: "A" },
      verdict: "OK",
    });
    expect(sdk.getSubmissionsSince).not.toHaveBeenCalled();
  });

  it("delegates both APIs unchanged when development mocks are disabled", async () => {
    vi.stubEnv("DEV_MOCK_CF_SUBMISSIONS", "false");
    sdk.getSubmissions.mockResolvedValue([{ id: 101 }]);
    sdk.getSubmissionsSince.mockResolvedValue([{ id: 102 }]);
    const { fetchCodeforcesUserStatus, getUserSubmissionsSince } =
      await import("./codeforces");

    await expect(
      fetchCodeforcesUserStatus("test_handle", 25, 2, "4A"),
    ).resolves.toEqual([{ id: 101 }]);
    await expect(
      getUserSubmissionsSince("test_handle", 456, "4A"),
    ).resolves.toEqual([{ id: 102 }]);
    expect(sdk.getSubmissions).toHaveBeenCalledWith("test_handle", {
      count: 25,
      from: 2,
    });
    expect(sdk.getSubmissionsSince).toHaveBeenCalledWith("test_handle", 456);
  });
});
