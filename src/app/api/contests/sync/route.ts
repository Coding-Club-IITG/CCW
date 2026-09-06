import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { publishUser } from "@/lib/contests/events";
import { cfSyncQueue } from "@/lib/contests/queues";
import { logger } from "@/lib/utils";
import { parseJson } from "@/lib/api/result";
import { contestSyncSchema } from "@/lib/api/schemas/contestRoute";
import {
  consumeUserRateLimit,
  releaseUserRateLimit,
} from "@/lib/userRateLimit";
import { webEnv } from "@/lib/env/web";
import {
  contestRoomStateSchema,
  parseContestRoomProblems,
} from "@/lib/contests/runtime";
import dbConnect from "@/lib/mongodb";
import CPUser from "@/models/CPUser";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";

export async function POST(request: NextRequest) {
  let consumedForUser: string | undefined;
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }
    const userId = session.user.id;

    const body = await parseJson(request, contestSyncSchema);
    if (!body.ok) return jsonResult(body);
    const { roomId, teamId, problemId } = body.data;

    await dbConnect();
    const cpUser = await CPUser.findOne({ userId }).lean();
    if (!cpUser?.cfHandle || !cpUser.cfVerified) {
      return jsonError("FORBIDDEN", "A verified Codeforces handle is required");
    }

    const room = await ContestRoom.findById(roomId).lean();
    if (!room || room.status !== "active") {
      return jsonError("CONFLICT", "This contest room is not active");
    }

    const redis = await getRedis();

    // 1. Resolve teamId if not provided
    let resolvedTeamId = teamId;
    if (!resolvedTeamId) {
      const teams = await redis.sMembers(`room:${roomId}:teams`);
      for (const tId of teams) {
        const isMember = await redis.sIsMember(`team:${tId}:users`, userId);
        if (isMember) {
          resolvedTeamId = tId;
          break;
        }
      }
      if (!resolvedTeamId) {
        return jsonError(
          "FORBIDDEN",
          "User is not part of any team in this room",
        );
      }
    }

    const team = await ContestTeam.findOne({
      _id: resolvedTeamId,
      roomId: room._id,
      members: userId,
    }).lean();
    if (!team) {
      return jsonError("FORBIDDEN", "You are not a member of this room's team");
    }

    const state = contestRoomStateSchema.parse(
      await redis.hGetAll(`room:${roomId}:state`),
    );
    if (state.status !== "active") {
      return jsonError("CONFLICT", "This contest room is not active");
    }
    const parsedProblems = parseContestRoomProblems(
      await redis.lRange(`room:${roomId}:problems`, 0, -1),
    );
    const problemIndex = parsedProblems.findIndex(
      (problem) => problem.problemId === problemId,
    );
    if (problemIndex === -1) {
      return jsonError("VALIDATION_ERROR", "Problem is not assigned to this room");
    }
    if (
      state.type !== "arena" &&
      problemIndex > Number.parseInt(state.currentProblem || "0", 10)
    ) {
      return jsonError("FORBIDDEN", "This problem has not been revealed yet");
    }

    // 2. Check rate limit
    const rateLimit = await consumeUserRateLimit(
      "contest-sync",
      userId,
      webEnv.SYNC_COOLDOWN,
    );
    if (!rateLimit.allowed) {
      return jsonError(
        "RATE_LIMITED",
        `Rate limit exceeded. Please wait ${rateLimit.retryAfter} seconds.`,
      );
    }
    consumedForUser = userId;

    // 3. Enqueue job
    const jobData = {
      roomId,
      userId,
      teamId: resolvedTeamId,
      cfHandle: cpUser.cfHandle,
      problemId,
    };
    const job = await cfSyncQueue.add("cf_sync", jobData);

    // Approximate position
    const waitingCount = await cfSyncQueue.getWaitingCount();
    const position = waitingCount + 1;
    const createdAt = Date.now();

    // 4. Set sync Hash state
    const syncStateKey = `sync:${roomId}:${userId}`;
    await redis.hSet(syncStateKey, {
      status: "queued",
      position: position.toString(),
      createdAt: createdAt.toString(),
      jobId: job.id || "",
    });
    // Set a TTL so it doesn't leak indefinitely (Eg. 1 hour)
    await redis.expire(syncStateKey, 3600);

    // 5. Publish event to user
    await publishUser(userId, { type: "sync.queued", position, problemId });

    // 6. Return 202
    return jsonOk({ queued: true }, { status: 202 });
  } catch (error: unknown) {
    if (consumedForUser) {
      await releaseUserRateLimit("contest-sync", consumedForUser);
    }
    logger.error("[/api/contests/sync] Error enqueuing sync job:", error);
    return jsonError("INTERNAL_ERROR", "Internal Server Error");
  }
}
