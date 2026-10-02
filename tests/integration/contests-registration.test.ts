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

import {
  registerForContest,
  unregisterFromContest,
  requestToJoinContestTeam,
  inviteToContestTeam,
  respondToContestTeamRequest,
  getContestTeamRequests,
  getAvailableTeamsForContest,
  getContestRegistrations,
  createRoomContest,
  createBracketContest,
} from "@/lib/actions/contests";
import { POST } from "@/app/api/contests/[id]/register/route";
import { createBracketContest as createAdminBracketContest } from "@/lib/actions/admin/contests";
import AuditLog from "@/models/AuditLog";
import ContestMatch from "@/models/ContestMatch";
import ContestRegistrationTeam from "@/models/ContestRegistrationTeam";
import ContestTeamRequest from "@/models/ContestTeamRequest";
import CPUser from "@/models/CPUser";
import Notification from "@/models/Notification";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), queueAdd: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/contests/queues", () => ({
  reconciliationQueue: { add: mocks.queueAdd },
}));

async function member(verified = true) {
  const id = new mongoose.Types.ObjectId();
  const profile = await CPUser.create({
    userId: id,
    cfHandle: `member_${id}`,
    cfVerified: verified,
  });
  return { id: String(id), handle: profile.cfHandle!, cpId: profile._id };
}
function login(id: string) {
  mocks.getSession.mockResolvedValue({ user: { id, access: "Member" } });
}
async function contest(overrides: Record<string, unknown> = {}) {
  return ContestMatch.create({
    creatorId: new mongoose.Types.ObjectId(),
    name: "Registration test",
    format: "team-tournament",
    mode: "blitz",
    teamSize: 3,
    status: "registration",
    problemSelectionMode: "test",
    startTime: new Date(Date.now() + 7_200_000),
    registrationSettings: {
      type: "open",
      startTime: new Date(Date.now() - 60_000),
      deadline: new Date(Date.now() + 3_600_000),
      maxParticipants: 6,
    },
    ...overrides,
  });
}
async function team(isPublic = false) {
  const owner = await member();
  const game = await contest();
  login(owner.id);
  expect(
    (await registerForContest(String(game._id), "Team [A]", isPublic)).ok,
  ).toBe(true);
  const registration = await ContestRegistrationTeam.findOne({
    contestId: game._id,
  }).orFail();
  return { owner, game, registration };
}
async function invite() {
  const setup = await team();
  const target = await member();
  expect(
    (
      await inviteToContestTeam(
        String(setup.game._id),
        String(setup.registration._id),
        target.handle,
      )
    ).ok,
  ).toBe(true);
  const request = await ContestTeamRequest.findOne({
    toUserId: target.id,
  }).orFail();
  login(target.id);
  return { ...setup, target, request };
}
function registrationCount(id: mongoose.Types.ObjectId) {
  return ContestMatch.findById(id).then((c) => c!.registrations!.length);
}

beforeAll(async () => {
  await startTestMongo();
  await Promise.all([
    ContestMatch.init(),
    ContestRegistrationTeam.init(),
    ContestTeamRequest.init(),
    CPUser.init(),
    Notification.init(),
    AuditLog.init(),
  ]);
});
beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  vi.useRealTimers();
  await clearTestMongo();
});
afterAll(stopTestMongo);

describe("contest registration boundaries", () => {
  it("authenticates registration, team discovery and roster reads", async () => {
    mocks.getSession.mockResolvedValue(null);
    const id = String(new mongoose.Types.ObjectId());
    for (const result of await Promise.all([
      registerForContest(id),
      getAvailableTeamsForContest(id),
      getContestRegistrations(id),
    ])) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    }
  });
  it("validates every registration/request ID and response action", async () => {
    const actor = await member();
    login(actor.id);
    const id = String(new mongoose.Types.ObjectId());
    for (const result of await Promise.all([
      registerForContest("bad"),
      unregisterFromContest("bad"),
      getContestRegistrations("bad"),
      getAvailableTeamsForContest("bad"),
      getContestTeamRequests("bad"),
      requestToJoinContestTeam(id, "bad"),
      inviteToContestTeam("bad", id, "handle"),
      respondToContestTeamRequest(id, "invalid" as "accept"),
    ]))
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_ERROR" },
      });
  });
  it.each(["draft", "provisioning", "active", "completed"])(
    "rejects registration when status is %s",
    async (status) => {
      const game = await contest({ status, teamSize: 1 });
      const user = await member();
      login(user.id);
      expect((await registerForContest(String(game._id))).ok).toBe(false);
      expect(await registrationCount(game._id)).toBe(0);
    },
  );
  it.each(["closed", "future", "deadline"])(
    "enforces the %s registration boundary in actions and REST",
    async (boundary) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2030-01-01T12:00:00Z"));
      const game = await contest({ teamSize: 1 });
      const user = await member();
      login(user.id);
      if (boundary === "closed") game.registrationSettings!.type = "closed";
      if (boundary === "future")
        game.registrationSettings!.startTime = new Date(Date.now() + 1);
      if (boundary === "deadline")
        game.registrationSettings!.deadline = new Date();
      await game.save();
      expect((await registerForContest(String(game._id))).ok).toBe(false);
      const response = await POST(
        new NextRequest("http://localhost/api/contests/register", {
          method: "POST",
        }),
        { params: Promise.resolve({ id: String(game._id) }) },
      );
      expect(response.status).toBe(400);
      expect(await registrationCount(game._id)).toBe(0);
    },
  );
  it("allows registration exactly at opening and prevents duplicate mixed-case IDs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T12:00:00Z"));
    const game = await contest({ teamSize: 1 });
    game.registrationSettings!.startTime = new Date();
    await game.save();
    const user = await member();
    login(user.id);
    expect((await registerForContest(String(game._id).toUpperCase())).ok).toBe(
      true,
    );
    expect((await registerForContest(String(game._id))).ok).toBe(false);
    expect(await registrationCount(game._id)).toBe(1);
  });
  it("rejects unverified members through both registration transports", async () => {
    const game = await contest({ teamSize: 1 });
    const user = await member(false);
    login(user.id);
    expect((await registerForContest(String(game._id))).ok).toBe(false);
    const response = await POST(
      new NextRequest("http://localhost/register", { method: "POST" }),
      { params: Promise.resolve({ id: String(game._id) }) },
    );
    expect(response.status).toBe(400);
  });
  it("rolls back new-team metadata when participant capacity is full", async () => {
    const setup = await team(true);
    await ContestMatch.updateOne(
      { _id: setup.game._id },
      { $set: { "registrationSettings.maxParticipants": 1 } },
    );
    const user = await member();
    login(user.id);
    expect(
      (await registerForContest(String(setup.game._id), "Orphan team", true))
        .ok,
    ).toBe(false);
    expect(await ContestRegistrationTeam.countDocuments()).toBe(1);
    expect(await registrationCount(setup.game._id)).toBe(1);
  });
  it("uses literal team names and prevents case-insensitive name takeover", async () => {
    const setup = await team(true);
    const user = await member();
    login(user.id);
    expect((await registerForContest(String(setup.game._id), ".*")).ok).toBe(
      false,
    );
    expect(
      (await registerForContest(String(setup.game._id), "team [a]", true)).ok,
    ).toBe(false);
    expect(
      (await registerForContest(String(setup.game._id), "team [a]")).ok,
    ).toBe(true);
    expect(
      (await ContestMatch.findById(setup.game._id))!.registrations![1].teamName,
    ).toBe("Team [A]");
  });
  it("requires approval for private teams even if legacy code data exists", async () => {
    const setup = await team();
    const user = await member();
    login(user.id);
    await ContestRegistrationTeam.collection.updateOne(
      { _id: setup.registration._id },
      { $set: { joinCode: "legacy" } },
    );
    expect(
      await registerForContest(String(setup.game._id), setup.registration.name),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    const available = await getAvailableTeamsForContest(String(setup.game._id));
    expect(available).toMatchObject({ ok: true, data: [{ isPublic: false }] });
    expect(JSON.stringify(available)).not.toMatch(
      /joinCode|legacy|requiresJoinCode/,
    );
    expect(
      (
        await requestToJoinContestTeam(
          String(setup.game._id),
          String(setup.registration._id),
        )
      ).ok,
    ).toBe(true);
    const request = await ContestTeamRequest.findOne({
      type: "join_request",
    }).orFail();
    login(setup.owner.id);
    expect(
      (await respondToContestTeamRequest(String(request._id), "accept")).ok,
    ).toBe(true);
  });
  it("does not restrict future registration because a member is playing elsewhere", async () => {
    const user = await member();
    login(user.id);
    await contest({
      status: "active",
      registrations: [{ userId: user.id, cfHandle: user.handle }],
    });
    const future = await contest({ teamSize: 1 });
    expect((await registerForContest(String(future._id))).ok).toBe(true);
  });
});

describe("contest team requests", () => {
  it.each(["closed", "future", "deadline", "missing-deadline", "unverified"])(
    "rejects new invitations and requests when %s",
    async (reason) => {
      const setup = await team();
      const target = await member(reason !== "unverified");
      if (reason === "closed")
        await ContestMatch.updateOne(
          { _id: setup.game._id },
          { $set: { "registrationSettings.type": "closed" } },
        );
      if (reason === "future")
        await ContestMatch.updateOne(
          { _id: setup.game._id },
          {
            $set: {
              "registrationSettings.startTime": new Date(Date.now() + 60_000),
            },
          },
        );
      if (reason === "deadline")
        await ContestMatch.updateOne(
          { _id: setup.game._id },
          { $set: { "registrationSettings.deadline": new Date(0) } },
        );
      if (reason === "missing-deadline")
        await ContestMatch.collection.updateOne(
          { _id: setup.game._id },
          { $unset: { "registrationSettings.deadline": "" } },
        );
      expect(
        (
          await inviteToContestTeam(
            String(setup.game._id),
            String(setup.registration._id),
            target.handle,
          )
        ).ok,
      ).toBe(false);
      login(target.id);
      expect(
        (
          await requestToJoinContestTeam(
            String(setup.game._id),
            String(setup.registration._id),
          )
        ).ok,
      ).toBe(false);
      expect(await ContestTeamRequest.countDocuments()).toBe(0);
      expect(await Notification.countDocuments()).toBe(0);
    },
  );
  it("creates supported indexes and allows multiple pending invite recipients", async () => {
    const setup = await team();
    const first = await member();
    const second = await member();
    for (const target of [first, second])
      expect(
        (
          await inviteToContestTeam(
            String(setup.game._id),
            String(setup.registration._id),
            target.handle,
          )
        ).ok,
      ).toBe(true);
    expect(
      (
        await inviteToContestTeam(
          String(setup.game._id),
          String(setup.registration._id),
          first.handle,
        )
      ).ok,
    ).toBe(false);
    expect(await ContestTeamRequest.countDocuments()).toBe(2);
    expect(await Notification.countDocuments()).toBe(2);
    const indexes = await ContestTeamRequest.collection.indexes();
    expect(
      indexes.find((i) => i.name === "unique_pending_invite")
        ?.partialFilterExpression,
    ).toEqual({
      status: "pending",
      type: "invite",
      toUserId: { $type: "string" },
    });
  });
  it("rejects cross-contest team IDs and unauthorized inviters", async () => {
    const setup = await team();
    const other = await contest();
    const target = await member();
    expect(
      (
        await inviteToContestTeam(
          String(other._id),
          String(setup.registration._id),
          target.handle,
        )
      ).ok,
    ).toBe(false);
    login(target.id);
    expect(
      (
        await requestToJoinContestTeam(
          String(other._id),
          String(setup.registration._id),
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await inviteToContestTeam(
          String(setup.game._id),
          String(setup.registration._id),
          target.handle,
        )
      ).ok,
    ).toBe(false);
    expect(await ContestTeamRequest.countDocuments()).toBe(0);
  });
  it("treats invited handles as literal case-insensitive values", async () => {
    const setup = await team();
    const target = await member();
    expect(
      (
        await inviteToContestTeam(
          String(setup.game._id),
          String(setup.registration._id),
          ".*",
        )
      ).ok,
    ).toBe(false);
    expect(
      (
        await inviteToContestTeam(
          String(setup.game._id),
          String(setup.registration._id),
          target.handle.toUpperCase(),
        )
      ).ok,
    ).toBe(true);
  });
  it.each([
    "full-team",
    "full-contest",
    "unverified",
    "already-registered",
    "closed",
    "future",
    "expired",
    "missing-team",
    "cross-contest",
    "new-leader",
  ])("keeps acceptance pending when %s validation fails", async (reason) => {
    const setup = await invite();
    if (reason === "full-team") {
      for (const _ of [0, 1]) {
        const extra = await member();
        await ContestMatch.updateOne(
          { _id: setup.game._id },
          {
            $push: {
              registrations: {
                userId: extra.id,
                cfHandle: extra.handle,
                teamName: setup.registration.name,
              },
            },
          },
        );
      }
    }
    if (reason === "full-contest")
      await ContestMatch.updateOne(
        { _id: setup.game._id },
        { $set: { "registrationSettings.maxParticipants": 1 } },
      );
    if (reason === "unverified")
      await CPUser.updateOne(
        { userId: setup.target.id },
        { $set: { cfVerified: false } },
      );
    if (reason === "already-registered")
      await ContestMatch.updateOne(
        { _id: setup.game._id },
        {
          $push: {
            registrations: {
              userId: setup.target.id,
              cfHandle: setup.target.handle,
              teamName: "Other",
            },
          },
        },
      );
    if (reason === "closed")
      await ContestMatch.updateOne(
        { _id: setup.game._id },
        { $set: { status: "completed" } },
      );
    if (reason === "future")
      await ContestMatch.updateOne(
        { _id: setup.game._id },
        {
          $set: {
            "registrationSettings.startTime": new Date(Date.now() + 60_000),
          },
        },
      );
    if (reason === "expired")
      await ContestMatch.updateOne(
        { _id: setup.game._id },
        { $set: { "registrationSettings.deadline": new Date(0) } },
      );
    if (reason === "missing-team")
      await ContestRegistrationTeam.deleteOne({ _id: setup.registration._id });
    if (reason === "cross-contest")
      await ContestTeamRequest.updateOne(
        { _id: setup.request._id },
        { $set: { contestId: new mongoose.Types.ObjectId() } },
      );
    if (reason === "new-leader")
      await ContestRegistrationTeam.updateOne(
        { _id: setup.registration._id },
        { $set: { leaderId: String(new mongoose.Types.ObjectId()) } },
      );
    const count = await registrationCount(setup.game._id);
    expect(
      (await respondToContestTeamRequest(String(setup.request._id), "accept"))
        .ok,
    ).toBe(false);
    expect((await ContestTeamRequest.findById(setup.request._id))!.status).toBe(
      "pending",
    );
    expect(await registrationCount(setup.game._id)).toBe(count);
  });
  it("returns explicit plain-data request DTOs only to the leader", async () => {
    const setup = await invite();
    expect(
      (await getContestTeamRequests(String(setup.registration._id))).ok,
    ).toBe(false);
    login(setup.owner.id);
    const result = await getContestTeamRequests(String(setup.registration._id));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(JSON.stringify(result.data))).toEqual(result.data);
      expect(result.data[0]).toMatchObject({
        contestId: String(setup.game._id),
        teamId: String(setup.registration._id),
        toUserId: setup.target.id,
        status: "pending",
      });
      expect(result.data[0]).not.toHaveProperty("__v");
    }
  });
  it("allows the recipient to reject after registration closes but forbids outsiders", async () => {
    const setup = await invite();
    const outsider = await member();
    login(outsider.id);
    expect(
      (await respondToContestTeamRequest(String(setup.request._id), "reject"))
        .ok,
    ).toBe(false);
    await ContestMatch.updateOne(
      { _id: setup.game._id },
      { $set: { status: "completed" } },
    );
    login(setup.target.id);
    expect(
      (await respondToContestTeamRequest(String(setup.request._id), "reject"))
        .ok,
    ).toBe(true);
  });
  it("rolls back membership if persisting accepted status fails", async () => {
    const setup = await invite();
    const db = mongoose.connection.db!;
    await db.command({
      collMod: "contest_team_requests",
      validator: { status: { $in: ["pending", "rejected"] } },
    });
    try {
      expect(
        (await respondToContestTeamRequest(String(setup.request._id), "accept"))
          .ok,
      ).toBe(false);
      expect(await registrationCount(setup.game._id)).toBe(1);
      expect(
        (await ContestTeamRequest.findById(setup.request._id))!.status,
      ).toBe("pending");
    } finally {
      await db.command({ collMod: "contest_team_requests", validator: {} });
    }
  });
});

describe("registration concurrency and departure", () => {
  it("admits a member to only one team when competing invitations are accepted together", async () => {
    const setup = await team();
    const otherLeader = await member();
    login(otherLeader.id);
    expect(
      (await registerForContest(String(setup.game._id), "Second team", false))
        .ok,
    ).toBe(true);
    const secondTeam = await ContestRegistrationTeam.findOne({
      leaderId: otherLeader.id,
    }).orFail();
    const target = await member();
    expect(
      (
        await inviteToContestTeam(
          String(setup.game._id),
          String(secondTeam._id),
          target.handle,
        )
      ).ok,
    ).toBe(true);
    login(setup.owner.id);
    expect(
      (
        await inviteToContestTeam(
          String(setup.game._id),
          String(setup.registration._id),
          target.handle,
        )
      ).ok,
    ).toBe(true);
    const requests = await ContestTeamRequest.find({ toUserId: target.id });
    login(target.id);
    const results = await Promise.all(
      requests.map((request) =>
        respondToContestTeamRequest(String(request._id), "accept"),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await registrationCount(setup.game._id)).toBe(3);
    expect(await ContestTeamRequest.countDocuments({ status: "pending" })).toBe(
      1,
    );
  });
  it("serializes different teams competing for the final contest place", async () => {
    const setup = await team();
    const otherLeader = await member();
    login(otherLeader.id);
    expect(
      (await registerForContest(String(setup.game._id), "Second team", true))
        .ok,
    ).toBe(true);
    const target = await member();
    const otherTarget = await member();
    login(setup.owner.id);
    expect(
      (
        await inviteToContestTeam(
          String(setup.game._id),
          String(setup.registration._id),
          target.handle,
        )
      ).ok,
    ).toBe(true);
    const request = await ContestTeamRequest.findOne({
      toUserId: target.id,
    }).orFail();
    await ContestMatch.updateOne(
      { _id: setup.game._id },
      { $set: { "registrationSettings.maxParticipants": 3 } },
    );
    mocks.getSession
      .mockResolvedValueOnce({ user: { id: target.id } })
      .mockResolvedValueOnce({ user: { id: otherTarget.id } });
    const results = await Promise.all([
      respondToContestTeamRequest(String(request._id), "accept"),
      registerForContest(String(setup.game._id), "Second team"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await registrationCount(setup.game._id)).toBe(3);
    expect((await ContestTeamRequest.findById(request._id))!.status).toBe(
      results[0].ok ? "accepted" : "pending",
    );
  });
  it("admits only one of two simultaneous acceptances for the last team slot", async () => {
    const setup = await team();
    const existing = await member();
    await ContestMatch.updateOne(
      { _id: setup.game._id },
      {
        $push: {
          registrations: {
            userId: existing.id,
            cfHandle: existing.handle,
            teamName: setup.registration.name,
          },
        },
      },
    );
    const first = await member();
    const second = await member();
    for (const user of [first, second])
      expect(
        (
          await inviteToContestTeam(
            String(setup.game._id),
            String(setup.registration._id),
            user.handle,
          )
        ).ok,
      ).toBe(true);
    const requests = await ContestTeamRequest.find().sort({ createdAt: 1 });
    mocks.getSession
      .mockResolvedValueOnce({ user: { id: first.id } })
      .mockResolvedValueOnce({ user: { id: second.id } });
    const results = await Promise.all(
      requests.map((r) => respondToContestTeamRequest(String(r._id), "accept")),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await registrationCount(setup.game._id)).toBe(3);
    expect(await ContestTeamRequest.countDocuments({ status: "pending" })).toBe(
      1,
    );
  });
  it("serializes duplicate acceptance and concurrent registration of the same member", async () => {
    const setup = await invite();
    const results = await Promise.all([
      respondToContestTeamRequest(String(setup.request._id), "accept"),
      respondToContestTeamRequest(String(setup.request._id), "accept"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await registrationCount(setup.game._id)).toBe(2);
    const solo = await contest({ teamSize: 1 });
    const joins = await Promise.all([
      registerForContest(String(solo._id)),
      registerForContest(String(solo._id)),
    ]);
    expect(joins.filter((r) => r.ok)).toHaveLength(1);
    expect(await registrationCount(solo._id)).toBe(1);
  });
  it("transfers leadership and closes former-leader invites atomically", async () => {
    const setup = await team(true);
    const next = await member();
    login(next.id);
    expect(
      (
        await registerForContest(
          String(setup.game._id),
          setup.registration.name,
        )
      ).ok,
    ).toBe(true);
    login(setup.owner.id);
    const target = await member();
    expect(
      (
        await inviteToContestTeam(
          String(setup.game._id),
          String(setup.registration._id),
          target.handle,
        )
      ).ok,
    ).toBe(true);
    expect((await unregisterFromContest(String(setup.game._id))).ok).toBe(true);
    expect(
      (await ContestRegistrationTeam.findById(setup.registration._id))!
        .leaderId,
    ).toBe(next.id);
    expect(await ContestTeamRequest.countDocuments({ status: "pending" })).toBe(
      0,
    );
    login(next.id);
    expect((await unregisterFromContest(String(setup.game._id))).ok).toBe(true);
    expect(await ContestRegistrationTeam.countDocuments()).toBe(0);
  });
  it("prevents departure at the registration deadline", async () => {
    const setup = await team();
    await ContestMatch.updateOne(
      { _id: setup.game._id },
      { $set: { "registrationSettings.deadline": new Date(0) } },
    );
    expect((await unregisterFromContest(String(setup.game._id))).ok).toBe(
      false,
    );
    expect(await registrationCount(setup.game._id)).toBe(1);
    expect(await ContestRegistrationTeam.countDocuments()).toBe(1);
  });
});

describe("complete-team REST registration", () => {
  async function post(id: string, teamName: string, memberIds: string[]) {
    return POST(
      new NextRequest("http://localhost/register", {
        method: "POST",
        body: JSON.stringify({ teamName, memberIds }),
      }),
      { params: Promise.resolve({ id }) },
    );
  }
  it("prevents complete-team requests from replacing a private team", async () => {
    const setup = await team();
    const users = [await member(), await member(), await member()];
    login(users[0].id);
    expect(
      (
        await post(
          String(setup.game._id),
          "team [a]",
          users.map((user) => user.id),
        )
      ).status,
    ).toBe(409);
    expect(await registrationCount(setup.game._id)).toBe(1);
    expect(
      (await ContestRegistrationTeam.findById(setup.registration._id))!
        .leaderId,
    ).toBe(setup.owner.id);
  });
  it("checks ownership, duplicate members, verification and complete capacity", async () => {
    const game = await contest();
    const users = [await member(), await member(), await member(false)];
    login(users[0].id);
    const ids = users.map((u) => u.id);
    expect(
      (await post(String(game._id), "REST", [ids[0], ids[0], ids[2]])).status,
    ).toBe(400);
    expect((await post(String(game._id), "REST", ids)).status).toBe(400);
    await CPUser.updateOne({ userId: ids[2] }, { $set: { cfVerified: true } });
    login(String(new mongoose.Types.ObjectId()));
    expect((await post(String(game._id), "REST", ids)).status).toBe(400);
    login(ids[0]);
    await ContestMatch.updateOne(
      { _id: game._id },
      { $set: { "registrationSettings.maxParticipants": 2 } },
    );
    expect((await post(String(game._id), "REST", ids)).status).toBe(409);
    expect(await ContestRegistrationTeam.countDocuments()).toBe(0);
    await ContestMatch.updateOne(
      { _id: game._id },
      { $set: { "registrationSettings.maxParticipants": 6 } },
    );
    expect((await post(String(game._id), "REST", ids)).status).toBe(200);
    expect(await registrationCount(game._id)).toBe(3);
    expect((await ContestRegistrationTeam.findOne())!.leaderId).toBe(ids[0]);
  });
});

describe("pre-registered contest members", () => {
  function input(users: Array<{ id: string; handle: string }>) {
    return {
      name: "Closed registration",
      format: "bracket",
      mode: "blitz",
      teamSize: 1,
      maxParticipants: 2,
      startTime: new Date(Date.now() + 3_600_000).toISOString(),
      registrationType: "closed",
      presetId: "custom",
      problemSelectionMode: "bulk",
      bulkPlatform: "codeforces",
      bulkRatingMin: 800,
      bulkRatingMax: 1200,
      bulkProblemCount: 1,
      registeredUsers: users.map((user) => ({
        id: user.id,
        cfHandle: "forged-handle",
      })),
    };
  }
  it.each([createRoomContest, createBracketContest, createAdminBracketContest])(
    "requires verified profiles and saves canonical handles",
    async (create) => {
      const first = await member();
      const second = await member(false);
      login(first.id);
      if (create === createAdminBracketContest)
        mocks.getSession.mockResolvedValue({
          user: { id: first.id, access: "Head" },
        });
      expect((await create(input([first, second]))).ok).toBe(false);
      expect(await ContestMatch.countDocuments()).toBe(0);
      await CPUser.updateOne(
        { userId: second.id },
        { $set: { cfVerified: true } },
      );
      const result = await create(input([first, second]));
      expect(result).toMatchObject({ ok: true });
      expect(
        (await ContestMatch.findOne())!.registrations!.map((r) => r.cfHandle),
      ).toEqual([first.handle, second.handle]);
    },
  );
  it("rejects duplicate, excess or open pre-registration before creating records", async () => {
    const first = await member();
    const second = await member();
    const third = await member();
    login(first.id);
    for (const data of [
      input([first, first]),
      input([first, second, third]),
      { ...input([first, second]), registrationType: "open" },
    ]) {
      expect((await createRoomContest(data)).ok).toBe(false);
    }
    expect(await ContestMatch.countDocuments()).toBe(0);
  });
  it("does not create a contest when registration starts at its deadline", async () => {
    const actor = await member();
    login(actor.id);
    const start = new Date(Date.now() + 3_600_000);
    const data = {
      ...input([]),
      registrationType: "open",
      startTime: start.toISOString(),
      registrationStartTime: new Date(start.getTime() - 180_000).toISOString(),
    };
    expect((await createRoomContest(data)).ok).toBe(false);
    expect(await ContestMatch.countDocuments()).toBe(0);
  });
});
