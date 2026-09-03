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
import { appendUserActivityLog } from "@/lib/contests/activityLog";

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
    const { roomId, teamId, cfHandle, problemId } = body.data;

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
      cfHandle,
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

    // 6. Persist to user activity log so it survives page refresh
    await appendUserActivityLog(redis, roomId, userId, {
      icon: "sync",
      text: "Submission queued for verification...",
      color: "text-secondary",
      timestamp: createdAt,
      eventType: "sync.queued",
    });

    // 7. Return 202
    return jsonOk({ queued: true }, { status: 202 });
  } catch (error: unknown) {
    if (consumedForUser) {
      await releaseUserRateLimit("contest-sync", consumedForUser);
    }
    logger.error("[/api/contests/sync] Error enqueuing sync job:", error);
    return jsonError("INTERNAL_ERROR", "Internal Server Error");
  }
}
