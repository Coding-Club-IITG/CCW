import { NextRequest } from "next/server";
import mongoose, { Types } from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { responseData, responseError } from "../utils/result";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";
import {
  HACKATHON_INVITEE_ID,
  HACKATHON_MEMBER_ID,
  HACKATHON_OWNER_ID,
  hackathon,
  hackathonSession,
  hackathonTeam,
} from "../fixtures/hackathons";

const getSession = vi.hoisted(() => vi.fn());
const notify = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/server", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/notifications/service", () => ({ notify }));

describe("hackathon join requests and invites", () => {
  beforeAll(async () => {
    await startTestMongo();
    await (await import("@/models/HackathonTeam")).default.createIndexes();
    await (await import("@/models/HackathonRequest")).default.createIndexes();
    getSession.mockResolvedValue(hackathonSession());
  });

  afterEach(async () => {
    await clearTestMongo();
    getSession.mockResolvedValue(hackathonSession());
    notify.mockReset();
  });

  afterAll(stopTestMongo);

  it("requires authentication and validates request types", async () => {
    const { POST } = await import("@/app/api/hackathons/requests/route");
    getSession.mockResolvedValueOnce(null);
    const unauthorized = await POST(
      jsonRequest("/api/hackathons/requests", "POST", {
        teamId: new Types.ObjectId().toString(),
        type: "join_request",
      }),
    );
    expect(unauthorized.status).toBe(401);

    const invalid = await POST(
      jsonRequest("/api/hackathons/requests", "POST", {
        teamId: new Types.ObjectId().toString(),
        type: "unknown",
      }),
    );
    expect(invalid.status).toBe(400);
  });

  it("creates one pending join request and notifies the owner", async () => {
    const { event, team } = await createEventAndTeam();
    const Request = (await import("@/models/HackathonRequest")).default;
    const { POST } = await import("@/app/api/hackathons/requests/route");

    const first = await POST(
      jsonRequest("/api/hackathons/requests", "POST", {
        teamId: team._id.toString(),
        type: "join_request",
      }),
    );

    expect(first.status).toBe(201);
    expect(await Request.findOne({ teamId: team._id }).lean()).toMatchObject({
      hackathonId: event._id,
      fromUserId: HACKATHON_MEMBER_ID,
      toUserId: HACKATHON_OWNER_ID,
      type: "join_request",
      status: "pending",
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: HACKATHON_OWNER_ID,
        type: "join_request",
      }),
    );

    const duplicate = await POST(
      jsonRequest("/api/hackathons/requests", "POST", {
        teamId: team._id.toString(),
        type: "join_request",
      }),
    );
    expect(duplicate.status).toBe(409);
    expect(await Request.countDocuments({ teamId: team._id })).toBe(1);
  });

  it.each([
    ["closed", "Team is not accepting members."],
    ["full", "Team is not accepting members."],
  ])("rejects requests to %s teams", async (status, error) => {
    const { team } = await createEventAndTeam({ status });
    const { POST } = await import("@/app/api/hackathons/requests/route");
    const response = await POST(
      jsonRequest("/api/hackathons/requests", "POST", {
        teamId: team._id.toString(),
        type: "join_request",
      }),
    );
    expect(response.status).toBe(400);
    expect(await responseError(response)).toMatchObject({ message: error });
  });

  it("rejects a join request from a member already on another team", async () => {
    const Team = (await import("@/models/HackathonTeam")).default;
    const { event, team } = await createEventAndTeam();
    await Team.create(
      hackathonTeam(event._id, {
        name: "Existing team",
        owner: HACKATHON_MEMBER_ID,
        members: [HACKATHON_MEMBER_ID],
      }),
    );
    const { POST } = await import("@/app/api/hackathons/requests/route");
    const response = await POST(
      jsonRequest("/api/hackathons/requests", "POST", {
        teamId: team._id.toString(),
        type: "join_request",
      }),
    );
    expect(response.status).toBe(409);
    expect((await responseError(response)).message).toContain(
      "already in a team",
    );
  });

  it("allows only the owner to invite a non-member", async () => {
    const { team } = await createEventAndTeam();
    const { POST } = await import("@/app/api/hackathons/requests/route");
    const forbidden = await POST(
      jsonRequest("/api/hackathons/requests", "POST", {
        teamId: team._id.toString(),
        type: "invite",
        toUserId: HACKATHON_INVITEE_ID,
      }),
    );
    expect(forbidden.status).toBe(403);

    getSession.mockResolvedValueOnce(
      hackathonSession({ id: HACKATHON_OWNER_ID, name: "Owner" }),
    );
    const accepted = await POST(
      jsonRequest("/api/hackathons/requests", "POST", {
        teamId: team._id.toString(),
        type: "invite",
        toUserId: HACKATHON_INVITEE_ID,
      }),
    );
    expect(accepted.status).toBe(201);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: HACKATHON_INVITEE_ID,
        type: "team_invite",
      }),
    );
  });

  it("allows only the team owner to resolve a join request", async () => {
    const { event, team } = await createEventAndTeam();
    const Request = (await import("@/models/HackathonRequest")).default;
    const { PATCH } = await import("@/app/api/hackathons/requests/[id]/route");
    const pending = await Request.create({
      teamId: team._id,
      hackathonId: event._id,
      fromUserId: HACKATHON_MEMBER_ID,
      toUserId: HACKATHON_OWNER_ID,
      type: "join_request",
    });

    const response = await PATCH(
      jsonRequest(`/api/hackathons/requests/${pending._id}`, "PATCH", {
        action: "accept",
      }),
      context(pending._id.toString()),
    );
    expect(response.status).toBe(403);
    expect((await Request.findById(pending._id).lean())?.status).toBe(
      "pending",
    );
  });

  it("accepts a join request atomically, fills the team, and rejects competing requests", async () => {
    const Team = (await import("@/models/HackathonTeam")).default;
    const Request = (await import("@/models/HackathonRequest")).default;
    const { PATCH } = await import("@/app/api/hackathons/requests/[id]/route");
    const { event, team } = await createEventAndTeam({}, { maxMembers: 2 });
    const otherTeam = await Team.create(
      hackathonTeam(event._id, {
        name: "Other",
        owner: "other-owner",
        members: ["other-owner"],
      }),
    );
    const [selected, competing] = await Request.create([
      {
        teamId: team._id,
        hackathonId: event._id,
        fromUserId: HACKATHON_MEMBER_ID,
        toUserId: HACKATHON_OWNER_ID,
        type: "join_request",
      },
      {
        teamId: otherTeam._id,
        hackathonId: event._id,
        fromUserId: HACKATHON_MEMBER_ID,
        toUserId: "other-owner",
        type: "join_request",
      },
    ]);
    getSession.mockResolvedValueOnce(
      hackathonSession({ id: HACKATHON_OWNER_ID }),
    );

    const response = await PATCH(
      jsonRequest(`/api/hackathons/requests/${selected._id}`, "PATCH", {
        action: "accept",
      }),
      context(selected._id.toString()),
    );

    expect(response.status).toBe(200);
    expect(await Team.findById(team._id).lean()).toMatchObject({
      members: [HACKATHON_OWNER_ID, HACKATHON_MEMBER_ID],
      status: "full",
    });
    expect((await Request.findById(selected._id).lean())?.status).toBe(
      "accepted",
    );
    expect((await Request.findById(competing._id).lean())?.status).toBe(
      "rejected",
    );
  });

  it("rejects acceptance when the member joined another team in the meantime", async () => {
    const Team = (await import("@/models/HackathonTeam")).default;
    const Request = (await import("@/models/HackathonRequest")).default;
    const { PATCH } = await import("@/app/api/hackathons/requests/[id]/route");
    const { event, team } = await createEventAndTeam();
    const pending = await Request.create({
      teamId: team._id,
      hackathonId: event._id,
      fromUserId: HACKATHON_MEMBER_ID,
      toUserId: HACKATHON_OWNER_ID,
      type: "join_request",
    });
    await Team.create(
      hackathonTeam(event._id, {
        name: "Won race",
        owner: HACKATHON_MEMBER_ID,
        members: [HACKATHON_MEMBER_ID],
      }),
    );
    getSession.mockResolvedValueOnce(
      hackathonSession({ id: HACKATHON_OWNER_ID }),
    );
    const response = await PATCH(
      jsonRequest(`/api/hackathons/requests/${pending._id}`, "PATCH", {
        action: "accept",
      }),
      context(pending._id.toString()),
    );
    expect(response.status).toBe(409);
    expect((await Request.findById(pending._id).lean())?.status).toBe(
      "rejected",
    );
  });

  it("allows only the invited user to reject an invite", async () => {
    const Request = (await import("@/models/HackathonRequest")).default;
    const { PATCH } = await import("@/app/api/hackathons/requests/[id]/route");
    const { event, team } = await createEventAndTeam();
    const invite = await Request.create({
      teamId: team._id,
      hackathonId: event._id,
      fromUserId: HACKATHON_OWNER_ID,
      toUserId: HACKATHON_INVITEE_ID,
      type: "invite",
    });
    getSession.mockResolvedValueOnce(
      hackathonSession({ id: HACKATHON_INVITEE_ID }),
    );
    const response = await PATCH(
      jsonRequest(`/api/hackathons/requests/${invite._id}`, "PATCH", {
        action: "reject",
      }),
      context(invite._id.toString()),
    );
    expect(response.status).toBe(200);
    expect((await Request.findById(invite._id).lean())?.status).toBe(
      "rejected",
    );
  });

  it("lists pending join requests with requester details only for the team owner", async () => {
    const Request = (await import("@/models/HackathonRequest")).default;
    const User = (await import("@/models/User")).default;
    const { GET } = await import("@/app/api/hackathons/requests/route");
    const { event, team } = await createEventAndTeam();
    const requester = await User.create({
      name: "Requesting Member",
      email: "requester@example.test",
      pizza_count: 2,
    });
    await Request.create({
      teamId: team._id,
      hackathonId: event._id,
      fromUserId: requester._id.toString(),
      toUserId: HACKATHON_OWNER_ID,
      type: "join_request",
    });

    const forbidden = await GET(
      new NextRequest(
        `http://localhost/api/hackathons/requests?teamId=${team._id}`,
      ),
    );
    expect(forbidden.status).toBe(403);

    getSession.mockResolvedValueOnce(
      hackathonSession({ id: HACKATHON_OWNER_ID }),
    );
    const response = await GET(
      new NextRequest(
        `http://localhost/api/hackathons/requests?teamId=${team._id}`,
      ),
    );
    const body = await responseData(response);
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.users[requester._id.toString()]).toEqual({
      name: "Requesting Member",
      pizza_count: 2,
    });
  });
  it("allows an owner to invite multiple different members", async () => {
    const { team } = await createEventAndTeam();
    const Request = (await import("@/models/HackathonRequest")).default;
    const { POST } = await import("@/app/api/hackathons/requests/route");
    getSession.mockResolvedValue(hackathonSession({ id: HACKATHON_OWNER_ID }));
    for (const toUserId of [HACKATHON_INVITEE_ID, "another-invitee"]) {
      const response = await POST(
        jsonRequest("/api/hackathons/requests", "POST", {
          teamId: String(team._id),
          type: "invite",
          toUserId,
        }),
      );
      expect(response.status).toBe(201);
    }
    expect(
      await Request.countDocuments({ teamId: team._id, status: "pending" }),
    ).toBe(2);
  });

  it.each([
    ["invite", "expired"],
    ["join_request", "expired"],
    ["invite", "archived"],
    ["join_request", "archived"],
    ["invite", "closed"],
    ["join_request", "closed"],
    ["invite", "deleted"],
    ["join_request", "deleted"],
  ])(
    "does not accept a pending %s when the hackathon or team becomes %s",
    async (type, state) => {
      const Hackathon = (await import("@/models/Hackathon")).default;
      const Team = (await import("@/models/HackathonTeam")).default;
      const Request = (await import("@/models/HackathonRequest")).default;
      const { PATCH } =
        await import("@/app/api/hackathons/requests/[id]/route");
      const { event, team } = await createEventAndTeam();
      const pending = await Request.create({
        teamId: team._id,
        hackathonId: event._id,
        type,
        fromUserId:
          type === "invite" ? HACKATHON_OWNER_ID : HACKATHON_MEMBER_ID,
        toUserId: type === "invite" ? HACKATHON_INVITEE_ID : HACKATHON_OWNER_ID,
      });
      if (state === "expired")
        await Hackathon.updateOne(
          { _id: event._id },
          { deadline: new Date(Date.now() - 1000) },
        );
      if (state === "archived")
        await Hackathon.updateOne({ _id: event._id }, { status: "archived" });
      if (state === "closed")
        await Team.updateOne({ _id: team._id }, { status: "closed" });
      if (state === "deleted") await Hackathon.deleteOne({ _id: event._id });
      getSession.mockResolvedValue(
        hackathonSession({
          id: type === "invite" ? HACKATHON_INVITEE_ID : HACKATHON_OWNER_ID,
        }),
      );
      const response = await PATCH(
        jsonRequest("/api/hackathons/requests/" + pending._id, "PATCH", {
          action: "accept",
        }),
        context(String(pending._id)),
      );
      expect(response.status).toBe(state === "closed" ? 409 : 400);
      expect((await Team.findById(team._id).lean())?.members).toEqual([
        HACKATHON_OWNER_ID,
      ]);
      expect((await Request.findById(pending._id).lean())?.status).toBe(
        "pending",
      );
      expect(notify).not.toHaveBeenCalled();
    },
  );

  it("rolls back membership and request state together when a database write fails", async () => {
    const Team = (await import("@/models/HackathonTeam")).default;
    const Request = (await import("@/models/HackathonRequest")).default;
    const Hackathon = (await import("@/models/Hackathon")).default;
    const { PATCH } = await import("@/app/api/hackathons/requests/[id]/route");
    const { event, team } = await createEventAndTeam();
    const invite = await Request.create({
      teamId: team._id,
      hackathonId: event._id,
      type: "invite",
      fromUserId: HACKATHON_OWNER_ID,
      toUserId: HACKATHON_INVITEE_ID,
    });
    const before = await Team.findById(team._id).lean();
    const db = mongoose.connection.db!;
    // A real MongoDB validator rejects the final request update after the member write.
    await db.command({
      collMod: Request.collection.name,
      validator: { status: "pending" },
      validationLevel: "strict",
      validationAction: "error",
    });
    getSession.mockResolvedValue(
      hackathonSession({ id: HACKATHON_INVITEE_ID }),
    );
    try {
      const response = await PATCH(
        jsonRequest("/api/hackathons/requests/" + invite._id, "PATCH", {
          action: "accept",
        }),
        context(String(invite._id)),
      );
      expect(response.status).toBe(500);
      expect(await Team.findById(team._id).lean()).toEqual(before);
      expect((await Request.findById(invite._id).lean())?.status).toBe(
        "pending",
      );
      expect((await Hackathon.findById(event._id).lean())?.__v).toBe(event.__v);
      expect(notify).not.toHaveBeenCalled();
    } finally {
      await db.command({ collMod: Request.collection.name, validator: {} });
    }
  });

  it("resolves concurrent accepts of the same invite exactly once", async () => {
    const Request = (await import("@/models/HackathonRequest")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const { PATCH } = await import("@/app/api/hackathons/requests/[id]/route");
    const { event, team } = await createEventAndTeam();
    const invite = await Request.create({
      teamId: team._id,
      hackathonId: event._id,
      type: "invite",
      fromUserId: HACKATHON_OWNER_ID,
      toUserId: HACKATHON_INVITEE_ID,
    });
    getSession.mockResolvedValue(
      hackathonSession({ id: HACKATHON_INVITEE_ID }),
    );
    const responses = await Promise.all(
      [0, 1].map(() =>
        PATCH(
          jsonRequest("/api/hackathons/requests/" + invite._id, "PATCH", {
            action: "accept",
          }),
          context(String(invite._id)),
        ),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 404,
    ]);
    expect((await Team.findById(team._id).lean())?.members).toEqual([
      HACKATHON_OWNER_ID,
      HACKATHON_INVITEE_ID,
    ]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("allows only one team to win concurrent invites to the same member", async () => {
    const Request = (await import("@/models/HackathonRequest")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const { PATCH } = await import("@/app/api/hackathons/requests/[id]/route");
    const { event, team } = await createEventAndTeam();
    const otherTeam = await Team.create(
      hackathonTeam(event._id, {
        owner: "other-owner",
        members: ["other-owner"],
      }),
    );
    const invites = await Request.create(
      [team, otherTeam].map((target) => ({
        teamId: target._id,
        hackathonId: event._id,
        type: "invite",
        fromUserId: target.owner,
        toUserId: HACKATHON_INVITEE_ID,
      })),
    );
    getSession.mockResolvedValue(
      hackathonSession({ id: HACKATHON_INVITEE_ID }),
    );
    const responses = await Promise.all(
      invites.map((invite: { _id: Types.ObjectId }) =>
        PATCH(
          jsonRequest("/api/hackathons/requests/" + invite._id, "PATCH", {
            action: "accept",
          }),
          context(String(invite._id)),
        ),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 404,
    ]);
    expect(
      await Team.countDocuments({
        hackathonId: event._id,
        members: HACKATHON_INVITEE_ID,
      }),
    ).toBe(1);
    expect(
      await Request.countDocuments({
        hackathonId: event._id,
        status: "accepted",
      }),
    ).toBe(1);
    expect(
      await Request.countDocuments({
        hackathonId: event._id,
        status: "rejected",
      }),
    ).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("does not exceed capacity when two members accept concurrently", async () => {
    const Request = (await import("@/models/HackathonRequest")).default;
    const Team = (await import("@/models/HackathonTeam")).default;
    const { PATCH } = await import("@/app/api/hackathons/requests/[id]/route");
    const { event, team } = await createEventAndTeam({}, { maxMembers: 2 });
    const invitees = [HACKATHON_INVITEE_ID, "another-invitee"];
    const invites = await Request.create(
      invitees.map((toUserId) => ({
        teamId: team._id,
        hackathonId: event._id,
        type: "invite",
        fromUserId: HACKATHON_OWNER_ID,
        toUserId,
      })),
    );
    for (const id of invitees)
      getSession.mockResolvedValueOnce(hackathonSession({ id }));
    const responses = await Promise.all(
      invites.map((invite: { _id: Types.ObjectId }) =>
        PATCH(
          jsonRequest("/api/hackathons/requests/" + invite._id, "PATCH", {
            action: "accept",
          }),
          context(String(invite._id)),
        ),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect((await Team.findById(team._id).lean())?.members).toHaveLength(2);
    expect((await Team.findById(team._id).lean())?.status).toBe("full");
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

async function createEventAndTeam(
  teamOverrides: Record<string, unknown> = {},
  eventOverrides: Record<string, unknown> = {},
) {
  const Hackathon = (await import("@/models/Hackathon")).default;
  const Team = (await import("@/models/HackathonTeam")).default;
  const event = await Hackathon.create(hackathon(eventOverrides));
  const team = await Team.create(hackathonTeam(event._id, teamOverrides));
  return { event, team };
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
