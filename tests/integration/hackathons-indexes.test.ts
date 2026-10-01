import { Types } from "mongoose";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import HackathonRequest from "@/models/HackathonRequest";
import HackathonTeam from "@/models/HackathonTeam";

import { hackathonTeam } from "../fixtures/hackathons";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

beforeAll(async () => {
  await startTestMongo();
  await Promise.all([HackathonRequest.init(), HackathonTeam.init()]);
});
beforeEach(async () => {
  await HackathonRequest.collection.dropIndexes();
  await HackathonTeam.collection.dropIndexes();
});
afterEach(clearTestMongo);
afterAll(stopTestMongo);

function invite(teamId: Types.ObjectId, toUserId: string) {
  return {
    teamId,
    hackathonId: new Types.ObjectId(),
    fromUserId: "owner",
    toUserId,
    type: "invite",
  };
}

describe("hackathon database constraints", () => {
  it("builds valid request indexes and allows multiple invitees per owner", async () => {
    await HackathonRequest.createIndexes();
    const teamId = new Types.ObjectId();
    await HackathonRequest.create([
      invite(teamId, "first"),
      invite(teamId, "second"),
    ]);
    await expect(
      HackathonRequest.create(invite(teamId, "first")),
    ).rejects.toMatchObject({ code: 11000 });
    expect(await HackathonRequest.countDocuments()).toBe(2);
  });

  it("allows distinct join requesters and invite history while blocking duplicate pending requests", async () => {
    await HackathonRequest.createIndexes();
    const teamId = new Types.ObjectId();
    const request = {
      teamId,
      hackathonId: new Types.ObjectId(),
      fromUserId: "member",
      toUserId: "owner",
      type: "join_request",
    };
    await HackathonRequest.create(request);
    await HackathonRequest.create({ ...request, fromUserId: "other-member" });
    await expect(HackathonRequest.create(request)).rejects.toMatchObject({
      code: 11000,
    });
    await HackathonRequest.updateOne(
      { teamId, fromUserId: "member" },
      { status: "rejected" },
    );
    await HackathonRequest.create(request);
    const oldInvite = await HackathonRequest.create(
      invite(teamId, "invited-member"),
    );
    await HackathonRequest.updateOne(
      { _id: oldInvite._id },
      { status: "accepted" },
    );
    await HackathonRequest.create(invite(teamId, "invited-member"));
    expect(await HackathonRequest.countDocuments()).toBe(5);
  });

  it("enforces one membership per hackathon at the database boundary", async () => {
    await HackathonTeam.createIndexes();
    const hackathonId = new Types.ObjectId();
    await HackathonTeam.create(
      hackathonTeam(hackathonId, {
        owner: "first-owner",
        members: ["first-owner", "member"],
      }),
    );
    await expect(
      HackathonTeam.create(
        hackathonTeam(hackathonId, {
          owner: "second-owner",
          members: ["second-owner", "member"],
        }),
      ),
    ).rejects.toMatchObject({ code: 11000 });
    await HackathonTeam.create(
      hackathonTeam(new Types.ObjectId(), { members: ["member"] }),
    );
    expect(await HackathonTeam.countDocuments()).toBe(2);
  });
});
