import mongoose from "mongoose";
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
import { GET as streamGET } from "@/app/api/contests/stream/route";
import { GET as snapshotGET } from "@/app/api/contests/[id]/bracket/snapshot/route";
import { POST as createRoomPOST } from "@/app/api/contests/rooms/route";
import { POST as readyPOST } from "@/app/api/contests/rooms/[id]/ready/route";
import { POST as syncPOST } from "@/app/api/contests/sync/route";

import { CONTEST_TIMING } from "@/lib/constants";

import {
  authorizeContestView,
  authorizeRoomView,
  type ContestViewer,
} from "@/lib/access/contests";
import {
  publishContest,
  publishRoom,
  publishUser,
} from "@/lib/contests/events";
import {
  getRoomOnlineUserIds,
  updateRoomPresence,
} from "@/lib/contests/presence";
import { reconciliationQueue } from "@/lib/contests/queues";
import { getRedis } from "@/lib/db/redis";

import ContestMatch from "@/models/ContestMatch";
import ContestRoom from "@/models/ContestRoom";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestTeam from "@/models/ContestTeam";
import CPUser from "@/models/CPUser";

import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

const sessions = vi.hoisted(() => new Map<string, { user: ContestViewer }>());
vi.mock("@/lib/auth/server", () => ({
  auth: {
    api: {
      getSession: vi.fn(
        async ({ headers }: { headers: Headers }) =>
          sessions.get(headers.get("x-viewer") ?? "") ?? null,
      ),
    },
  },
}));
vi.mock("@/lib/contests/queues", async () => {
  const { Queue } = await import("bullmq");
  const { bullMqConnection } = await import("@/lib/queues/bullMq");
  return {
    reconciliationQueue: new Queue(`ccw-test-streams-${process.pid}`, {
      connection: bullMqConnection,
    }),
  };
});

const newId = () => String(new mongoose.Types.ObjectId());
const roomIds: string[] = [];
const teamIds: string[] = [];
const contestIds: string[] = [];
type StreamEvent = {
  event: string;
  data: {
    channel?: string;
    payload?: Record<string, unknown>;
    subscribedChannels?: string[];
  };
};
type ConsumedStream = {
  events: StreamEvent[];
  done: Promise<void>;
  ended: () => boolean;
  close: () => Promise<void>;
  wait: (type: string) => Promise<Record<string, unknown>>;
};
const streams: ConsumedStream[] = [];
let redis: Awaited<ReturnType<typeof getRedis>>;
async function viewer(access = "Member", roles?: unknown) {
  const id = newId();
  const user = { id, access, roles };
  sessions.set(id, { user });
  const profile = await CPUser.create({
    userId: id,
    cfHandle: `stream_${id}`,
    cfVerified: true,
  });
  return { ...user, cpId: String(profile._id) };
}
async function fixture(
  restriction: "none" | "all" | "admin_creator" | "club_members" = "all",
  member?: Awaited<ReturnType<typeof viewer>>,
) {
  const owner = await viewer();
  const player = member ?? (await viewer());
  const game = await ContestMatch.create({
    name: "Stream fixture",
    creatorId: owner.cpId,
    format: "bracket",
    mode: "blitz",
    status: "active",
    teamSize: 1,
    spectatorRestriction: restriction,
    registrations: [{ userId: player.id, cfHandle: `stream_${player.id}` }],
    problemSelectionMode: "bulk",
  });
  const room = await ContestRoom.create({
    contestId: game._id,
    name: "Match fixture",
    status: "active",
    participants: [player.id],
  });
  const team = await ContestTeam.create({
    contestId: game._id,
    roomId: room._id,
    name: "Team fixture",
    teamSize: 1,
    members: [player.id],
  });
  room.teams = [team._id];
  await room.save();
  const roomId = String(room._id),
    teamId = String(team._id),
    contestId = String(game._id);
  roomIds.push(roomId);
  teamIds.push(teamId);
  contestIds.push(contestId);
  await ContestProblemSet.create({
    contestId,
    roomId,
    problems: [
      {
        platform: "codeforces",
        problemId: roomId,
        name: "Isolated problem",
        points: 100,
      },
    ],
  });
  await redis.hSet(`room:${roomId}:state`, {
    status: "active",
    type: "blitz",
    contestId,
    currentProblem: "1",
  });
  await redis.sAdd(`room:${roomId}:teams`, teamId);
  await redis.sAdd(`team:${teamId}:users`, player.id);
  await redis.rPush(
    `room:${roomId}:problems`,
    JSON.stringify({ problemId: roomId, name: "Isolated problem" }),
  );
  return { owner, player, room, team, game, roomId, teamId, contestId };
}
function request(path: string, user?: ContestViewer, signal?: AbortSignal) {
  return new NextRequest(`http://localhost${path}`, {
    headers: user ? { "x-viewer": user.id } : {},
    signal,
  });
}
async function consume(response: Response): Promise<ConsumedStream> {
  expect(response.status).toBe(200);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Array<{
    event: string;
    data: {
      channel?: string;
      payload?: Record<string, unknown>;
      subscribedChannels?: string[];
    };
  }> = [];
  let buffer = "",
    ended = false;
  const done = (async () => {
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const lines = frame.split("\n");
          events.push({
            event: lines[0].slice(7),
            data: JSON.parse(lines[1].slice(6)),
          });
        }
      }
    } finally {
      ended = true;
    }
  })();
  const stream = {
    events,
    done,
    ended: () => ended,
    close: async () => {
      await reader.cancel();
      await done;
    },
    wait: async (type: string) => {
      await vi.waitFor(
        () =>
          expect(
            events.some((event) => event.data.payload?.type === type),
          ).toBe(true),
        { timeout: 3000, interval: 10 },
      );
      return events.find((event) => event.data.payload?.type === type)!.data
        .payload!;
    },
  };
  streams.push(stream);
  return stream;
}
async function open(
  f: Awaited<ReturnType<typeof fixture>>,
  user: ContestViewer = f.player,
) {
  const stream = await consume(
    await streamGET(request(`/api/contests/stream?roomId=${f.roomId}`, user)),
  );
  await stream.wait("room.state_sync");
  return stream;
}
beforeAll(async () => {
  await startTestMongo();
  redis = await getRedis();
  const url = new URL(process.env.REDIS_URL!);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/15"
  )
    throw new Error("Stream tests require isolated local Redis DB 15.");
});
afterEach(async () => {
  for (const stream of streams.splice(0)) await stream.close();
  await reconciliationQueue.drain(true);
  for (const roomId of roomIds.splice(0)) {
    const keys = await redis.keys(`room:${roomId}:*`);
    if (keys.length) await redis.del(keys);
  }
  for (const teamId of teamIds.splice(0)) {
    const keys = await redis.keys(`team:${teamId}:*`);
    if (keys.length) await redis.del(keys);
  }
  for (const contestId of contestIds.splice(0)) {
    const keys = await redis.keys(`contest:${contestId}:*`);
    if (keys.length) await redis.del(keys);
  }
  vi.useRealTimers();
  sessions.clear();
  await clearTestMongo();
});
afterAll(async () => {
  await reconciliationQueue.obliterate({ force: true });
  await reconciliationQueue.close();
  redis.destroy();
  await stopTestMongo();
});

describe("shared contest and room access", () => {
  it.each(["none", "all", "admin_creator", "club_members"] as const)(
    "enforces %s on room access, snapshots and streams",
    async (restriction) => {
      const f = await fixture(restriction);
      const outsider = await viewer();
      const allowed = restriction === "all";
      expect((await authorizeContestView(f.contestId, outsider)).ok).toBe(
        allowed,
      );
      expect((await authorizeRoomView(f.roomId, outsider)).ok).toBe(allowed);
      const snapshot = await snapshotGET(request("/snapshot", outsider), {
        params: Promise.resolve({ id: f.contestId }),
      });
      expect(snapshot.status).toBe(allowed ? 200 : 403);
      const response = await streamGET(
        request(`/api/contests/stream?roomId=${f.roomId}`, outsider),
      );
      expect(response.status).toBe(allowed ? 200 : 403);
      if (allowed) {
        const stream = await consume(response);
        await stream.wait("room.state_sync");
        expect(await getRoomOnlineUserIds(f.roomId)).toEqual([]);
      }
      expect(await authorizeRoomView(f.roomId, f.player)).toMatchObject({
        ok: true,
        data: { isParticipant: true, isSpectator: false, teamId: f.teamId },
      });
    },
  );
  it("supports canonical creator references, Heads/Admins and serialized club roles", async () => {
    const f = await fixture("admin_creator");
    for (const user of [f.owner, await viewer("Head"), await viewer("Admin")])
      expect((await authorizeRoomView(f.roomId, user)).ok).toBe(true);

    await ContestMatch.updateOne(
      { _id: f.game._id },
      { $set: { creatorId: f.owner.id } },
    );
    expect((await authorizeRoomView(f.roomId, f.owner)).ok).toBe(false);
    await ContestMatch.updateOne(
      { _id: f.game._id },
      { $set: { creatorId: f.owner.cpId } },
    );

    const club = await viewer(
      "Member",
      JSON.stringify([
        { position: "Core Team", module: "Competitive Programming" },
      ]),
    );
    expect((await authorizeRoomView(f.roomId, club)).ok).toBe(false);
    await ContestMatch.updateOne(
      { _id: f.game._id },
      { $set: { spectatorRestriction: "club_members" } },
    );
    expect((await authorizeRoomView(f.roomId, club)).ok).toBe(true);
    const malformed = await viewer("Member", "invalid");
    expect((await authorizeRoomView(f.roomId, malformed)).ok).toBe(false);
  });
  it("does not grant match access merely through another bracket match", async () => {
    const f = await fixture("none");
    const other = await viewer();
    await ContestMatch.updateOne(
      { _id: f.game._id },
      {
        $push: { registrations: { userId: other.id, cfHandle: "registered" } },
      },
    );
    expect((await authorizeContestView(f.contestId, other)).ok).toBe(true);
    expect((await authorizeRoomView(f.roomId, other)).ok).toBe(false);
    await ContestMatch.updateOne(
      { _id: f.game._id },
      { $set: { spectatorRestriction: "all" } },
    );
    expect(await authorizeRoomView(f.roomId, other)).toMatchObject({
      ok: true,
      data: { isSpectator: true, teamId: null },
    });
  });
  it("rejects unauthenticated, malformed, cross-contest and orphan references before subscribing", async () => {
    const f = await fixture();
    const other = await fixture();
    expect(
      (await streamGET(request(`/api/contests/stream?roomId=${f.roomId}`)))
        .status,
    ).toBe(401);
    for (const query of [
      "",
      "roomId=bad",
      `roomId=${f.roomId}&rooms=${other.roomId}`,
    ])
      expect(
        (await streamGET(request(`/api/contests/stream?${query}`, f.player)))
          .status,
      ).toBe(400);
    expect(
      (
        await streamGET(
          request(
            `/api/contests/stream?roomId=${f.roomId}&contestId=${other.contestId}`,
            f.player,
          ),
        )
      ).status,
    ).toBe(404);
    await ContestMatch.deleteOne({ _id: f.game._id });
    expect(
      (
        await streamGET(
          request(`/api/contests/stream?roomId=${f.roomId}`, f.player),
        )
      ).status,
    ).toBe(404);
    expect(await redis.exists(`room:${f.roomId}:presence_connections`)).toBe(0);
  });
  it("keeps spectators read-only on readiness and sync endpoints", async () => {
    const f = await fixture();
    const spectator = await viewer();
    expect(
      (
        await readyPOST(request("/ready", spectator), {
          params: Promise.resolve({ id: f.roomId }),
        })
      ).status,
    ).toBe(403);
    const sync = await syncPOST(
      new NextRequest("http://localhost/sync", {
        method: "POST",
        headers: { "x-viewer": spectator.id },
        body: JSON.stringify({
          roomId: f.roomId,
          teamId: f.teamId,
          problemId: f.roomId,
        }),
      }),
    );
    expect(sync.status).toBe(403);
    expect(await redis.sMembers(`room:${f.roomId}:ready_users`)).toEqual([]);
  });
  it("does not let spectators create a room to bypass participation permissions", async () => {
    const f = await fixture("none");
    const outsider = await viewer();
    for (const [user, status] of [
      [outsider, 403],
      [f.owner, 409],
      [await viewer("Head"), 409],
    ] as const) {
      const response = await createRoomPOST(
        new NextRequest("http://localhost/api/contests/rooms", {
          method: "POST",
          headers: { "x-viewer": user.id },
          body: JSON.stringify({
            contestId: f.contestId,
            teams: [
              { name: "A", members: [outsider.id] },
              { name: "B", members: [f.player.id] },
            ],
          }),
        }),
      );
      expect(response.status).toBe(status);
      if (status === 409)
        expect(await response.json()).toMatchObject({
          ok: false,
          error: { message: "This contest cannot open a direct room." },
        });
    }
    expect(await ContestRoom.countDocuments()).toBe(1);
  });
});

describe("isolated live events and connection presence", () => {
  it("uses the shared heartbeat and refreshes spectator presence after a crashed connection expires", async () => {
    const f = await fixture();
    const spectator = await viewer();
    await updateRoomPresence(f.roomId, "refresh", {
      userId: f.player.id,
      id: "crashed",
      expirySeconds: CONTEST_TIMING.presenceExpirySeconds,
    });
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const stream = await open(f, spectator);
    expect((await stream.wait("room.state_sync")).onlineUserIds).toEqual([
      f.player.id,
    ]);
    await redis.del(`room:${f.roomId}:presence_connections`);
    await vi.advanceTimersByTimeAsync(
      CONTEST_TIMING.heartbeatSeconds * 1000 - 1,
    );
    expect(stream.events.some((event) => event.event === "ping")).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await stream.wait("presence.sync")).onlineUserIds).toEqual([]);
    expect(stream.events.some((event) => event.event === "ping")).toBe(true);
    expect(await getRoomOnlineUserIds(f.roomId)).toEqual([]);
  });
  it("isolates two rooms and their personal sync results for the same participant", async () => {
    const first = await fixture();
    const second = await fixture("all", first.player);
    const a = await open(first),
      b = await open(second);
    expect(
      a.events.find((e) => e.event === "connected")!.data.subscribedChannels,
    ).toEqual([
      `events:room:${first.roomId}`,
      `events:user:${first.player.id}`,
    ]);
    expect((await a.wait("room.state_sync")).problems).toMatchObject([
      { problemId: first.roomId, name: "Isolated problem" },
    ]);
    await publishRoom(second.roomId, {
      type: "room.end",
      finalScores: { team: 77 },
    });
    await publishUser(first.player.id, second.roomId, {
      type: "sync.failed",
      reason: "second-room",
    });
    await b.wait("sync.failed");
    await redis.publish(
      `events:user:${first.player.id}`,
      JSON.stringify({ type: "sync.failed", reason: "legacy-unscoped" }),
    );
    await publishRoom(first.roomId, {
      type: "room.end",
      finalScores: { team: 88 },
    });
    await a.wait("room.end");
    expect(
      a.events.filter((e) => e.data.payload?.type === "room.end"),
    ).toHaveLength(1);
    expect(a.events.some((e) => e.data.payload?.type === "sync.failed")).toBe(
      false,
    );
    expect(
      a.events.filter((e) => e.data.payload?.type === "room.state_sync"),
    ).toHaveLength(1);
    expect(await getRoomOnlineUserIds(first.roomId)).toEqual([first.player.id]);
    await a.close();
    expect(await getRoomOnlineUserIds(second.roomId)).toEqual([
      first.player.id,
    ]);
  });
  it("keeps a second tab online and closing every tab never schedules a forfeit", async () => {
    const f = await fixture();
    const a = await open(f),
      b = await open(f);
    expect(await redis.zCard(`room:${f.roomId}:presence_connections`)).toBe(2);
    expect(
      await redis.pTTL(`room:${f.roomId}:presence_connections`),
    ).toBeGreaterThan(0);
    await a.close();
    expect(await getRoomOnlineUserIds(f.roomId)).toEqual([f.player.id]);
    expect(
      await reconciliationQueue.getJob(
        `disconnect-timeout-${f.roomId}-${f.player.id}`,
      ),
    ).toBeUndefined();
    expect(
      b.events.filter((e) => e.data.payload?.type === "room.state_sync"),
    ).toHaveLength(1);
    await b.close();
    expect(await getRoomOnlineUserIds(f.roomId)).toEqual([]);
    expect(
      await reconciliationQueue.getJob(
        `disconnect-timeout-${f.roomId}-${f.player.id}`,
      ),
    ).toBeUndefined();
    const reconnect = await open(f);
    expect(
      await reconciliationQueue.getJob(
        `disconnect-timeout-${f.roomId}-${f.player.id}`,
      ),
    ).toBeUndefined();
    expect((await reconnect.wait("room.state_sync")).onlineUserIds).toEqual([
      f.player.id,
    ]);
  });
  it("uses absolute connection expiry, recovers expired tabs and ignores immortal legacy keys", async () => {
    const f = await fixture();
    const connection = {
      userId: f.player.id,
      id: "crashed-tab",
      expirySeconds: 45,
    };
    await redis.set(`room:${f.roomId}:presence:${f.player.id}`, "online");
    expect(await getRoomOnlineUserIds(f.roomId)).toEqual([]);
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = Date.now();
    vi.setSystemTime(now);
    await updateRoomPresence(f.roomId, "refresh", connection);
    vi.setSystemTime(now + 45_000);
    expect(await getRoomOnlineUserIds(f.roomId)).toEqual([]);
    const changes = await updateRoomPresence(f.roomId, "prune");
    expect(changes.leftUserIds).toEqual([f.player.id]);
    expect(await redis.exists(`room:${f.roomId}:presence_connections`)).toBe(0);
    await updateRoomPresence(f.roomId, "refresh", {
      ...connection,
      id: "reconnected",
    });
    expect(await getRoomOnlineUserIds(f.roomId)).toEqual([f.player.id]);
  });
  it("subscribes contest viewers only to their authorized contest without match presence", async () => {
    const f = await fixture("none");
    const other = await fixture();
    const stream = await consume(
      await streamGET(
        request(`/api/contests/stream?contestId=${f.contestId}`, f.player),
      ),
    );
    await stream.wait("contest.bracket_update");
    expect(
      stream.events.find((e) => e.event === "connected")!.data
        .subscribedChannels,
    ).toEqual([`events:contest:${f.contestId}`]);
    await publishRoom(f.roomId, {
      type: "room.end",
      finalScores: { team: 42 },
    });
    await publishContest(other.contestId, {
      type: "contest.status_change",
      status: "completed",
    });
    await publishContest(f.contestId, {
      type: "contest.status_change",
      status: "active",
    });
    expect((await stream.wait("contest.status_change")).status).toBe("active");
    expect(stream.events.some((e) => e.data.payload?.type === "room.end")).toBe(
      false,
    );
    expect(await getRoomOnlineUserIds(f.roomId)).toEqual([]);
  });
  it("closes a spectator stream before forwarding events after access is revoked", async () => {
    const f = await fixture();
    const spectator = await viewer();
    const stream = await open(f, spectator);
    expect(
      stream.events.find((e) => e.event === "connected")!.data
        .subscribedChannels,
    ).toEqual([`events:room:${f.roomId}`]);
    await ContestMatch.updateOne(
      { _id: f.game._id },
      { $set: { spectatorRestriction: "none" } },
    );
    await publishRoom(f.roomId, {
      type: "room.end",
      finalScores: { team: 200 },
    });
    await vi.waitFor(() => expect(stream.ended()).toBe(true));
    expect(stream.events.some((e) => e.data.payload?.type === "room.end")).toBe(
      false,
    );
  });
  it("closes revoked sessions and handles aborts before and during initialization", async () => {
    const f = await fixture();
    const stream = await open(f);
    sessions.delete(f.player.id);
    await publishRoom(f.roomId, {
      type: "room.end",
      finalScores: { team: 200 },
    });
    await vi.waitFor(() => expect(stream.ended()).toBe(true));
    await stream.close();
    expect(await getRoomOnlineUserIds(f.roomId)).toEqual([]);
    sessions.set(f.player.id, { user: f.player });
    for (const early of [true, false]) {
      const abort = new AbortController();
      if (early) abort.abort();
      const response = await streamGET(
        request(
          `/api/contests/stream?roomId=${f.roomId.toUpperCase()}`,
          f.player,
          abort.signal,
        ),
      );
      const stopped = await consume(response);
      abort.abort();
      await stopped.close();
      expect(await getRoomOnlineUserIds(f.roomId)).toEqual([]);
    }
  });
});

vi.mock("@/lib/platforms/problemContent", async (original) => ({
  ...(await original<typeof import("@/lib/platforms/problemContent")>()),
  fetchProblemContentForScheduling: vi.fn(async () => ({
    title: "Fixture problem",
    statementHtml: "<p>Fixture statement</p>",
    inputSpecificationHtml: "",
    outputSpecificationHtml: "",
    samples: [],
    sourceUrl: "https://codeforces.com",
  })),
}));
