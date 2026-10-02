import { publishRoom } from "@/lib/contests/events";
import { reconciliationQueue } from "@/lib/contests/queues";
import { parseContestRoomProblems } from "@/lib/contests/runtime";
import { getRedis } from "@/lib/db/redis";
import { workerEnv } from "@/lib/env/worker";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import ContestMatch from "@/models/ContestMatch";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";

// Apply durable state without resetting live problem progress
const synchronizeScript = `
local snapshot = cjson.decode(ARGV[1])
local revision = tonumber(redis.call('HGET', KEYS[1], 'participationRevision') or '-1')
if revision > snapshot.revision then return 0 end
local completed = redis.call('HGET', KEYS[1], 'status') == 'completed'
for key, value in pairs(snapshot.state) do
  if key ~= 'status' or not completed then redis.call('HSET', KEYS[1], key, value) end
end
redis.call('DEL', KEYS[2], KEYS[3], KEYS[4])
for _, user in ipairs(snapshot.ready) do redis.call('SADD', KEYS[2], user) end
for _, user in ipairs(snapshot.admitted) do redis.call('SADD', KEYS[3], user) end
for _, team in ipairs(snapshot.teams) do redis.call('SADD', KEYS[4], team) end
if redis.call('EXISTS', KEYS[5]) == 0 then
  for _, problem in ipairs(snapshot.problems) do redis.call('RPUSH', KEYS[5], problem) end
end
if snapshot.state.status == 'active' and not completed then
  local problems = redis.call('LRANGE', KEYS[5], 0, -1)
  for index, raw in ipairs(problems) do
    local problem = cjson.decode(raw)
    if (snapshot.state.type == 'arena' or index == 1) and (problem.revealedAt == nil or problem.revealedAt == cjson.null) then
      local revealed = string.gsub(raw, '"revealedAt":null', '"revealedAt":' .. snapshot.state.startTime, 1)
      redis.call('LSET', KEYS[5], index - 1, revealed)
    end
  end
end
return 1
`;

export async function synchronizeRoomRuntime(roomId: string) {
  const room = await ContestRoom.findById(roomId).lean();

  if (!room || room.status === "pending") {
    return;
  }

  const contest = await ContestMatch.findById(room.contestId).lean();

  if (!contest) {
    return;
  }

  const redis = await getRedis();
  const teams = await ContestTeam.find({
    _id: { $in: room.teams },
    roomId,
  }).lean();
  const problemSet = await ContestProblemSet.findOne({ roomId }).lean();
  const state: Record<string, string> = {
    status: room.status === "ended" ? "completed" : room.status,
    type: contest.mode,
    contestId: String(contest._id),
    participationRevision: String(room.participationRevision),
    startTime: room.actualStartTime
      ? String(room.actualStartTime.getTime())
      : "",
    timeLimit: String(room.durationSeconds ?? ""),
    readyOpensAt: room.readyOpensAt ? String(room.readyOpensAt.getTime()) : "",
    readyDeadline: room.readyDeadline
      ? String(room.readyDeadline.getTime())
      : "",
    matchDeadline: room.matchDeadline
      ? String(room.matchDeadline.getTime())
      : "",
  };

  if (room.problemDurationSeconds) {
    state.problemTimeLimit = String(room.problemDurationSeconds);
  }

  await redis.sAdd(`contest:${contest._id}:rooms`, roomId);

  for (const team of teams) {
    const teamId = String(team._id);

    await redis.hSetNX(`team:${teamId}:meta`, "name", team.name);
    await redis.hSetNX(`team:${teamId}:meta`, "score", String(team.score));

    if (team.members.length) {
      await redis.sAdd(`team:${teamId}:users`, team.members.map(String));
    }
  }

  await redis.hSetNX(`room:${roomId}:state`, "currentProblem", "0");
  const applied = await redis.eval(synchronizeScript, {
    keys: ["state", "ready_users", "admitted_users", "teams", "problems"].map(
      (key) => `room:${roomId}:${key}`,
    ),
    arguments: [
      JSON.stringify({
        revision: room.participationRevision,
        state,
        ready: room.readyUserIds.map(String),
        admitted: room.admissions.map((admission) => String(admission.userId)),
        teams: (room.status === "active"
          ? room.playingTeamIds
          : room.teams
        ).map(String),
        problems: (problemSet?.problems ?? []).map((problem) =>
          JSON.stringify({ ...problem, revealedAt: null }),
        ),
      }),
    ],
  });

  if (!applied) {
    return;
  }

  if (room.status === "waiting" || room.status === "active") {
    const waiting = room.status === "waiting";
    const deadline = waiting ? room.readyDeadline : room.matchDeadline;

    if (!deadline) {
      throw new Error("Room is missing its persisted deadline.");
    }

    const jobId = `${waiting ? "ready" : "room"}-timeout-${roomId}`;
    const existing = await reconciliationQueue.getJob(jobId);

    if (existing && (await existing.getState()) === "failed") {
      await existing.retry();
    } else {
      await reconciliationQueue.add(
        waiting ? "ready_timeout" : "room_timeout",
        {
          roomId,
          contestId: String(contest._id),
          ...(waiting ? {} : { trigger: "timeout" as const }),
        },
        { delay: Math.max(0, deadline.getTime() - Date.now()), jobId },
      );
    }
  }

  const currentState = await redis.hGetAll(`room:${roomId}:state`);

  await publishRoom(roomId, {
    type: "room.state_sync",
    roomId,
    state: currentState,
    readyUserIds: await redis.sMembers(`room:${roomId}:ready_users`),
    admittedUserIds: await redis.sMembers(`room:${roomId}:admitted_users`),
    problems:
      currentState.status === "waiting"
        ? []
        : parseContestRoomProblems(
            await redis.lRange(`room:${roomId}:problems`, 0, -1),
          ),
  });

  if (room.status === "ended") {
    await publishRoom(roomId, {
      type: "room.end",
      roomId,
      reason: room.terminationReason,
    });
  }

  // Later mutation keeps its outbox flag until its own effects are delivered
  await ContestRoom.updateOne(
    { _id: roomId, participationRevision: room.participationRevision },
    { $set: { runtimeSyncPending: false } },
  );
}

export async function recoverRoomParticipation() {
  const { readyOrEnterRoom, releaseRoomParticipation } =
    await import("@/lib/contests/participation");

  // Rebuild current lifecycle jobs after a worker restart or interrupted delivery
  let failed = false;

  for await (const room of ContestRoom.find({
    $or: [
      { status: { $in: ["waiting", "active"] } },
      {
        status: "pending",
        readyOpensAt: {
          $lte: new Date(Date.now() + workerEnv.ROOM_PRE_START_SECONDS * 1000),
        },
      },
      { status: "ended", runtimeSyncPending: true },
    ],
  }).cursor()) {
    try {
      if (room.status === "pending") {
        await ContestRoom.updateOne(
          { _id: room._id, status: "pending" },
          { $set: { status: "waiting", runtimeSyncPending: true } },
        );
      }

      if (
        room.status === "waiting" &&
        room.readyDeadline &&
        room.readyDeadline.getTime() <= Date.now()
      ) {
        const result = await readyOrEnterRoom(String(room._id));

        if (!result.ok) throw new Error(result.error.message);
      } else {
        if (room.status === "ended") {
          await releaseRoomParticipation(String(room._id));
        }

        await synchronizeRoomRuntime(String(room._id));
      }
    } catch (error) {
      failed = true;
      logger.error("Contest room recovery failed", {
        roomId: String(room._id),
        ...errorToLogMetadata(error),
      });
    }
  }

  if (failed) throw new Error("Some contest rooms could not be recovered");
}
