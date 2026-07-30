import { NextRequest } from "next/server";
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
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import {
  HACKATHON_MEMBER_ID,
  HACKATHON_OWNER_ID,
  hackathon,
  hackathonSession,
  hackathonTeam,
} from "../fixtures/hackathons";

const getSession = vi.hoisted(() => vi.fn());
const notify = vi.hoisted(() => vi.fn());
const notifyMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/notify", () => ({ notify, notifyMany }));

describe("hackathon team routes", () => {
  beforeAll(async () => {
    await startTestMongo();
    getSession.mockResolvedValue(hackathonSession());
  });
  afterEach(async () => {
    await clearTestMongo();
    getSession.mockResolvedValue(hackathonSession());
    notify.mockReset();
    notifyMany.mockReset();
    vi.useRealTimers();
  });
  afterAll(stopTestMongo);

  it("requires authentication for team listing", async () => {
    const { GET } = await import("@/app/api/hackathons/[id]/teams/route");
    getSession.mockResolvedValueOnce(null);
    const response = await GET(
      request("/api/hackathons/id"),
      context("507f1f77bcf86cd799439011"),
    );
    expect(response.status).toBe(401);
  });

  it("lists teams with resolved and fallback member details", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const User = (await import("@/models/User")).default;
    const { GET } = await import("@/app/api/hackathons/[id]/teams/route");
    const event = await Hackathon.create(hackathon());
    const known = await User.create({
      name: "Known Member",
      email: "known-hackathon@example.test",
      pizza_count: 4,
    });
    await Team.create(
      hackathonTeam(event._id, {
        members: [known._id.toString(), "missing-user"],
      }),
    );
    const response = await GET(
      request(`/api/hackathons/${event._id}/teams`),
      context(event._id.toString()),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.teams[0].memberDetails).toEqual([
      { id: known._id.toString(), name: "Known Member", pizza_count: 4 },
      { id: "missing-user", name: "Unknown" },
    ]);
  });

  it("rejects creating a team after the deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-08-04T00:00:00.000Z"));
    const Hackathon = (await import("@/models/Hackathon")).default;
    const { POST } = await import("@/app/api/hackathons/[id]/teams/route");
    const event = await Hackathon.create(hackathon());
    const response = await POST(
      jsonRequest(`/api/hackathons/${event._id}/teams`, "POST", {
        name: "Late team",
      }),
      context(event._id.toString()),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("deadline");
  });

  it("creates one normalized team per member and marks solo teams full", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const { POST } = await import("@/app/api/hackathons/[id]/teams/route");
    const event = await Hackathon.create(hackathon({ maxMembers: 1 }));
    const first = await POST(
      jsonRequest(`/api/hackathons/${event._id}/teams`, "POST", {
        name: " Solo ",
        description: " One person ",
      }),
      context(event._id.toString()),
    );
    expect(first.status).toBe(201);
    expect(await Team.findOne({ hackathonId: event._id }).lean()).toMatchObject(
      {
        name: "Solo",
        members: [HACKATHON_MEMBER_ID],
        status: "full",
      },
    );
    const duplicate = await POST(
      jsonRequest(`/api/hackathons/${event._id}/teams`, "POST", {
        name: "Second",
      }),
      context(event._id.toString()),
    );
    expect(duplicate.status).toBe(400);
  });

  it("allows only the owner to edit a team", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const { PATCH } = await import("@/app/api/hackathons/teams/[id]/route");
    const event = await Hackathon.create(hackathon());
    const team = await Team.create(hackathonTeam(event._id));
    const forbidden = await PATCH(
      jsonRequest(`/api/hackathons/teams/${team._id}`, "PATCH", {
        name: "Hijacked",
      }),
      context(team._id.toString()),
    );
    expect(forbidden.status).toBe(403);
    getSession.mockResolvedValueOnce(
      hackathonSession({ id: HACKATHON_OWNER_ID }),
    );
    const updated = await PATCH(
      jsonRequest(`/api/hackathons/teams/${team._id}`, "PATCH", {
        name: " Updated ",
        owner: HACKATHON_MEMBER_ID,
      }),
      context(team._id.toString()),
    );
    expect(updated.status).toBe(200);
    expect((await Team.findById(team._id).lean())?.owner).toBe(
      HACKATHON_OWNER_ID,
    );
  });

  it("removes a non-owner member, reopens the team, and notifies them", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const { PATCH } = await import("@/app/api/hackathons/teams/[id]/route");
    const event = await Hackathon.create(hackathon());
    const team = await Team.create(
      hackathonTeam(event._id, {
        members: [HACKATHON_OWNER_ID, HACKATHON_MEMBER_ID],
        status: "full",
      }),
    );
    getSession.mockResolvedValueOnce(
      hackathonSession({ id: HACKATHON_OWNER_ID }),
    );
    const response = await PATCH(
      jsonRequest(`/api/hackathons/teams/${team._id}`, "PATCH", {
        action: "remove_member",
        memberId: HACKATHON_MEMBER_ID,
      }),
      context(team._id.toString()),
    );
    expect(response.status).toBe(200);
    expect(await Team.findById(team._id).lean()).toMatchObject({
      members: [HACKATHON_OWNER_ID],
      status: "open",
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: HACKATHON_MEMBER_ID }),
    );
  });

  it("does not reopen a team already at maximum capacity", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const { PATCH } = await import("@/app/api/hackathons/teams/[id]/route");
    const event = await Hackathon.create(hackathon({ maxMembers: 2 }));
    const team = await Team.create(
      hackathonTeam(event._id, {
        members: [HACKATHON_OWNER_ID, HACKATHON_MEMBER_ID],
        status: "full",
      }),
    );
    getSession.mockResolvedValueOnce(
      hackathonSession({ id: HACKATHON_OWNER_ID }),
    );
    const response = await PATCH(
      jsonRequest(`/api/hackathons/teams/${team._id}`, "PATCH", {
        action: "toggle_status",
      }),
      context(team._id.toString()),
    );
    expect(response.status).toBe(400);
  });

  it("deletes an owned team, its requests, and notifies other members", async () => {
    const Hackathon = (await import("@/models/Hackathon")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const Request = (await import("@/models/HackathonRequest")).default;
    const { DELETE } = await import("@/app/api/hackathons/teams/[id]/route");
    const event = await Hackathon.create(hackathon());
    const team = await Team.create(
      hackathonTeam(event._id, {
        members: [HACKATHON_OWNER_ID, HACKATHON_MEMBER_ID],
      }),
    );
    await Request.create({
      teamId: team._id,
      hackathonId: event._id,
      fromUserId: "requester",
      toUserId: HACKATHON_OWNER_ID,
      type: "join_request",
    });
    getSession.mockResolvedValueOnce(
      hackathonSession({ id: HACKATHON_OWNER_ID }),
    );
    const response = await DELETE(
      request(`/api/hackathons/teams/${team._id}`, "DELETE"),
      context(team._id.toString()),
    );
    expect(response.status).toBe(200);
    expect(await Team.findById(team._id)).toBeNull();
    expect(await Request.countDocuments({ teamId: team._id })).toBe(0);
    expect(notifyMany).toHaveBeenCalledWith(
      [HACKATHON_MEMBER_ID],
      expect.objectContaining({ type: "team_deleted" }),
    );
  });
});

function request(path: string, method = "GET") {
  return new NextRequest(`http://localhost${path}`, { method });
}
function jsonRequest(path: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function context(id: string) {
  return { params: Promise.resolve({ id }) };
}
