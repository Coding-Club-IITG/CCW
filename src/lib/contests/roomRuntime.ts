import { CONTEST_TIMING } from "@/lib/constants";

import { publishRoom } from "@/lib/contests/events";
import { reconciliationQueue, cfSyncQueue } from "@/lib/contests/queues";
import { roomGameplaySnapshot } from "@/lib/contests/roomSnapshot";
import { submissionWindow } from "@/lib/contests/matchScoring";
import { getRedis } from "@/lib/db/redis";
import { workerEnv } from "@/lib/env/worker";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import ContestMatch from "@/models/ContestMatch";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import ContestSubmission from "@/models/ContestSubmission";
import CPUser from "@/models/CPUser";

// One revision projects both gameplay and participation after a committed transition
const synchronizeScript = `
local snapshot = cjson.decode(ARGV[1])
local revision = tonumber(redis.call('HGET', KEYS[1], 'participationRevision') or '-1')
if revision > snapshot.revision then return 0 end
redis.call('DEL', unpack(KEYS))
for key, value in pairs(snapshot.state) do redis.call('HSET', KEYS[1], key, value) end
for _, user in ipairs(snapshot.ready) do redis.call('SADD', KEYS[2], user) end
for _, user in ipairs(snapshot.admitted) do redis.call('SADD', KEYS[3], user) end
for _, team in ipairs(snapshot.teams) do redis.call('SADD', KEYS[4], team) end
for _, problem in ipairs(snapshot.problems) do redis.call('RPUSH', KEYS[5], problem) end
for team, score in pairs(snapshot.scores) do redis.call('ZADD', KEYS[6], score, team) end
for problem, claim in pairs(snapshot.locks) do redis.call('HSET', KEYS[7], problem, claim) end
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
  const { state, scores, locks, problems } = roomGameplaySnapshot(
    room,
    contest.mode,
    problemSet?.problems ?? [],
  );

  await redis.sAdd(`contest:${contest._id}:rooms`, roomId);

  for (const team of teams) {
    const teamId = String(team._id);

    await redis.hSetNX(`team:${teamId}:meta`, "name", team.name);
    await redis.hSetNX(`team:${teamId}:meta`, "score", String(team.score));

    if (team.members.length) {
      await redis.sAdd(`team:${teamId}:users`, team.members.map(String));
    }
  }

  const applied = await redis.eval(synchronizeScript, {
    keys: [
      "state",
      "ready_users",
      "admitted_users",
      "teams",
      "problems",
      "scores",
      "locks",
    ].map((key) => `room:${roomId}:${key}`),
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
        scores,
        locks,
        problems: problems.map((problem) => JSON.stringify(problem)),
      }),
    ],
  });

  if (!applied) {
    return;
  }

  const schedule = async (
    name:
      "ready_timeout" | "room_timeout" | "problem_timeout" | "finalize_match",
    deadline: Date | number,
    suffix = "",
  ) => {
    const at = typeof deadline === "number" ? deadline : deadline.getTime();
    const jobId = name + "-" + roomId + suffix;
    const existing = await reconciliationQueue.getJob(jobId);

    if (existing && (await existing.getState()) === "failed") {
      await existing.retry();
    } else {
      await reconciliationQueue.add(
        name,
        { roomId, contestId: String(contest._id) },
        {
          delay: Math.max(0, at - Date.now()),
          jobId,
        },
      );
    }
  };

  if (room.status === "waiting") {
    if (!room.readyDeadline)
      throw new Error("Room is missing its persisted ready deadline.");

    await schedule("ready_timeout", room.readyDeadline);
  } else if (room.status === "active") {
    if (room.judgingDeadline) {
      await schedule("finalize_match", room.judgingDeadline);
    } else {
      if (!room.matchDeadline)
        throw new Error("Room is missing its persisted match deadline.");

      await schedule("room_timeout", room.matchDeadline);

      const current = room.problemStates[room.currentProblemIndex];

      if (
        contest.mode === "blitz" &&
        current?.deadlineAt &&
        current.closedAt === undefined
      ) {
        await schedule(
          "problem_timeout",
          current.deadlineAt,
          "-" + room.currentProblemIndex,
        );
      }
    }
  }

  if (room.status === "active") {
    const pending = await ContestSubmission.find({
      roomId,
      verdict: { $in: ["TESTING", "UNKNOWN"] },
    }).lean();
    const profiles = await CPUser.find({
      userId: { $in: pending.map((submission) => submission.userId) },
      cfVerified: true,
    }).lean();
    const scheduled = new Set<string>();
    const delay = CONTEST_TIMING.judgingPollMs;

    for (const submission of pending) {
      const userId = String(submission.userId);
      const key = userId + "-" + submission.problemId;
      const admission = room.admissions.find(
        (entry) => String(entry.userId) === userId,
      );
      const problem = room.problemStates.find(
        (entry) => entry.problemId === submission.problemId,
      );
      const profile = profiles.find((entry) => String(entry.userId) === userId);

      if (scheduled.has(key) || !admission || !problem || !profile?.cfHandle)
        continue;

      const window = submissionWindow(
        room,
        problem,
        admission.admittedAt.getTime(),
      );

      if (Date.now() + delay > window.judgingDeadline) continue;

      scheduled.add(key);
      await cfSyncQueue.add(
        "cf_sync",
        {
          roomId,
          userId,
          teamId: String(admission.teamId),
          cfHandle: profile.cfHandle,
          problemId: problem.problemId,
        },
        {
          delay,
          jobId:
            "judging-" + roomId + "-" + key + "-" + room.participationRevision,
          removeOnComplete: true,
        },
      );
    }
  }

  await publishRoom(roomId, {
    type: "room.state_sync",
    roomId,
    state,
    scores,
    locks,
    readyUserIds: room.readyUserIds.map(String),
    admittedUserIds: room.admissions.map((admission) =>
      String(admission.userId),
    ),
    problems: room.status === "waiting" ? [] : problems,
  });

  if (room.status === "ended") {
    await publishRoom(roomId, {
      type: "room.end",
      roomId,
      reason: room.terminationReason,
      finalScores: scores,
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
      } else if (room.status === "active") {
        const { reconcileMatch } = await import("@/lib/contests/gameplay");

        await reconcileMatch(String(room._id));
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
