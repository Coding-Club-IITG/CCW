import { NextRequest } from "next/server";

import { CONTEST_TIMING } from "@/lib/constants";

import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auth } from "@/lib/auth/server";
import { getRedis } from "@/lib/db/redis";
import { publishUser } from "@/lib/contests/events";
import { cfSyncQueue } from "@/lib/contests/queues";
import { logger } from "@/lib/telemetry/logger";
import { parseJson } from "@/lib/api/result";
import { contestSyncSchema } from "@/lib/api/schemas/contestRoute";
import {
  consumeUserRateLimit,
  releaseUserRateLimit,
} from "@/lib/users/rateLimit";
import { webEnv } from "@/lib/env/web";
import { submissionWindow } from "@/lib/contests/matchScoring";
import { connectMongoDB } from "@/lib/db/mongodb";

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

    await connectMongoDB();

    const cpUser = await CPUser.findOne({ userId }).lean();

    if (!cpUser?.cfHandle || !cpUser.cfVerified) {
      return jsonError("FORBIDDEN", "A verified Codeforces handle is required");
    }

    const room = await ContestRoom.findById(roomId).lean();

    if (!room || room.status !== "active") {
      return jsonError("CONFLICT", "This contest room is not active");
    }

    const redis = await getRedis();

    const resolvedTeamId =
      teamId ??
      room.admissions
        .find((entry) => String(entry.userId) === userId)
        ?.teamId.toString();

    if (!resolvedTeamId)
      return jsonError(
        "FORBIDDEN",
        "Enter this match before syncing submissions.",
      );

    const team = await ContestTeam.findOne({
      _id: resolvedTeamId,
      roomId: room._id,
      members: userId,
    }).lean();

    if (!team) {
      return jsonError("FORBIDDEN", "You are not a member of this room's team");
    }

    if (
      !room.admissions.some(
        (admission) =>
          String(admission.userId) === userId &&
          String(admission.teamId) === resolvedTeamId,
      )
    ) {
      return jsonError(
        "FORBIDDEN",
        "Enter the active match before syncing submissions.",
      );
    }

    const problem = room.problemStates.find(
      (entry) => entry.problemId === problemId,
    );

    if (!problem)
      return jsonError(
        "VALIDATION_ERROR",
        "Problem is not assigned to this room",
      );
    if (problem.revealedAt === undefined)
      return jsonError("FORBIDDEN", "This problem has not been revealed yet");

    const admission = room.admissions.find(
      (entry) => String(entry.userId) === userId,
    )!;
    const window = submissionWindow(
      room,
      problem,
      admission.admittedAt.getTime(),
    );

    if (Date.now() > window.judgingDeadline)
      return jsonError("CONFLICT", "Judging has closed for this problem");

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
    // Expire sync status after the configured retention window
    await redis.expire(syncStateKey, CONTEST_TIMING.syncRetentionSeconds);

    // 5. Publish event to user
    await publishUser(userId, roomId, {
      type: "sync.queued",
      position,
      problemId,
    });

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
