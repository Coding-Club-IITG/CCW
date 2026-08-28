import mongoose from "mongoose";
import { NextRequest } from "next/server";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import AuditLog from "@/models/AuditLog";
import ContestMatch, { type IContestMatch } from "@/models/ContestMatch";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  postCommitEffect: vi.fn(async () => undefined),
  publishContest: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("@/lib/contests/events", () => ({
  publishContest: mocks.publishContest,
}));
vi.mock("@/lib/contests/bracket", () => ({
  generateBracket: vi.fn(
    async (
      contestId: string,
      _solved: Set<string> | undefined,
      effects: Array<() => Promise<void>>,
    ) => {
      effects.push(mocks.postCommitEffect);
      return snapshot(contestId);
    },
  ),
  getBracketSnapshot: vi.fn(async (contestId: string) => snapshot(contestId)),
  processWalkover: vi.fn(
    async (
      roomId: string,
      _winnerTeamId: string,
      _note: string,
      _adminUserId: string,
      effects: Array<() => Promise<void>>,
    ) => {
      effects.push(mocks.postCommitEffect);
      return snapshot(roomId);
    },
  ),
}));

describe("contest administrative audit", () => {
  beforeAll(startTestMongo);
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({
      user: { id: "head-1", name: "Contest Head", access: "Head" },
      session: { id: "session-1", userId: "head-1" },
    });
  });
  afterEach(async () => {
    await clearTestMongo();
    vi.clearAllMocks();
  });
  afterAll(stopTestMongo);

  it("records bracket generation and runs Redis/SSE work after commit", async () => {
    const contest = await ContestMatch.create(contestRecord());
    mocks.postCommitEffect.mockImplementationOnce(async () => {
      expect(await AuditLog.countDocuments()).toBe(1);
    });
    const { POST } =
      await import("@/app/api/contests/[id]/bracket/generate/route");

    const response = await POST(
      new NextRequest(
        `http://localhost/api/contests/${contest._id}/bracket/generate`,
        {
          method: "POST",
        },
      ),
      { params: Promise.resolve({ id: contest._id.toString() }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.postCommitEffect).toHaveBeenCalledOnce();
    expect(await AuditLog.findOne()).toMatchObject({
      category: "contests",
      action: "generate_bracket",
      operation: "contests.bracket.generate",
      after: { name: "Audit tournament", problemCount: 1 },
    });
  });

  it("records a walkover without its note or participant identities", async () => {
    const roomId = new mongoose.Types.ObjectId().toString();
    const winnerTeamId = new mongoose.Types.ObjectId().toString();
    const { POST } =
      await import("@/app/api/contests/rooms/[id]/walkover/route");

    const response = await POST(
      jsonRequest(`/api/contests/rooms/${roomId}/walkover`, {
        winnerTeamId,
        note: "Private administrative rationale",
      }),
      { params: Promise.resolve({ id: roomId }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.postCommitEffect).toHaveBeenCalledOnce();
    const audit = await AuditLog.findOne().lean();
    expect(audit).toMatchObject({
      category: "contests",
      action: "walkover",
      operation: "contests.walkover",
      after: { status: "ended", participantCount: 1 },
    });
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("Private administrative rationale");
    expect(serialized).not.toContain(winnerTeamId);
  });

  it("audits a lifecycle change and publishes it only after commit", async () => {
    const contest = await ContestMatch.create(
      contestRecord({ status: "draft" }),
    );
    const { PATCH } = await import("@/app/api/contests/[id]/status/route");

    const response = await PATCH(
      jsonRequest(`/api/contests/${contest._id}/status`, { action: "publish" }),
      { params: Promise.resolve({ id: contest._id.toString() }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.publishContest).toHaveBeenCalledOnce();
    expect(await AuditLog.findOne()).toMatchObject({
      category: "contests",
      action: "status_change",
      operation: "contests.status.publish",
      before: { status: "draft" },
      after: { status: "registration" },
    });
  });
});

function contestRecord(overrides: Partial<Pick<IContestMatch, "status">> = {}) {
  return {
    name: "Audit tournament",
    creatorId: new mongoose.Types.ObjectId(),
    format: "bracket",
    mode: "blitz",
    status: "provisioning",
    teamSize: 1,
    problemSelectionMode: "test",
    ...overrides,
  } as const;
}

function snapshot(contestId: string) {
  return {
    contestId,
    currentRound: 1,
    totalRounds: 1,
    nodes: [
      {
        roomId: new mongoose.Types.ObjectId().toString(),
        roundNumber: 1,
        matchIndex: 0,
        teams: [null, null] as [null, null],
        teamNames: [null, null] as [null, null],
        teamImages: [null, null] as [null, null],
        scores: [0, 0] as [number, number],
        status: "pending" as const,
        winner: null,
        bracketPosition: "0-0",
      },
    ],
  };
}

function jsonRequest(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
