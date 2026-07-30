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

const health = vi.hoisted(() => ({
  codeforces: vi.fn(),
  atcoder: vi.fn(),
}));

vi.mock("@/lib/platforms/codeforces", () => ({
  isCodeforcesAPIReachable: health.codeforces,
}));
vi.mock("@/lib/platforms/atcoder", () => ({
  isAtCoderAPIReachable: health.atcoder,
}));
vi.mock("@/lib/potd/recompute", () => ({
  fetchUserSubmissions: vi.fn(async () => []),
}));

describe("POTD finalization job", () => {
  beforeAll(async () => {
    await startTestMongo();
  });

  afterEach(async () => {
    await clearTestMongo();
    vi.clearAllMocks();
    health.codeforces.mockResolvedValue(true);
    health.atcoder.mockResolvedValue(true);
  });

  afterAll(async () => {
    await stopTestMongo();
  });

  it("leaves state untouched when no challenge is eligible", async () => {
    const { finalize } = await import("@/lib/potd/finalize");

    await finalize(new Date("2026-07-30T00:00:00.000Z"));

    expect(health.codeforces).not.toHaveBeenCalled();
    expect(health.atcoder).not.toHaveBeenCalled();
  });

  it("finalizes a healthy day and recomputes every participating member", async () => {
    const { finalize } = await import("@/lib/potd/finalize");
    const now = new Date("2026-07-30T21:00:00.000Z");
    const user = await User.create({ name: "Finalized Member" });
    await CPUser.create({ userId: user._id });
    const codeforces = await endedChallenge(
      "codeforces",
      "Easy",
      new mongoose.Types.ObjectId(),
    );
    const atcoder = await endedChallenge(
      "atcoder",
      "Hard",
      new mongoose.Types.ObjectId(),
    );
    await POTDSubmission.create([
      {
        userId: user._id,
        challengeId: codeforces._id,
        status: "Accepted",
        solvedAt: new Date("2026-07-30T10:00:00.000Z"),
      },
      {
        userId: user._id,
        challengeId: atcoder._id,
        status: "Late",
        solvedAt: new Date("2026-07-30T19:00:00.000Z"),
      },
    ]);

    await finalize(now);

    expect(health.codeforces).toHaveBeenCalledOnce();
    expect(health.atcoder).toHaveBeenCalledOnce();
    expect(await DailyChallenge.countDocuments({ finalizedAt: now })).toBe(2);
    expect(await CPUser.findOne({ userId: user._id }).lean()).toMatchObject({
      potdTotalPoints: 150,
      potdTotalSolved: 2,
      potdCurrentStreak: 1,
    });
  });
});

async function endedChallenge(
  platform: "codeforces" | "atcoder",
  difficulty: "Easy" | "Hard",
  setBy: mongoose.Types.ObjectId,
) {
  const problem = await Problem.create({
    platform,
    contestId: `${platform}-fixture`,
    problemIndex: difficulty,
    name: `${platform} ${difficulty}`,
    rating: 1000,
  });
  return DailyChallenge.create({
    ...computeWindowTimes("2026-07-30"),
    problem: problem._id,
    difficulty,
    setBy,
  });
}
