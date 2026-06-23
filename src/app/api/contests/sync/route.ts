import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import { cfSyncQueue } from "@/lib/bullmq";
import { publishUser } from "@/lib/sse";
import { logger } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    let userId = "";

    if (process.env.NODE_ENV === "development" && request.headers.get("x-test-user-id")) {
      userId = request.headers.get("x-test-user-id")!;
    } else {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = session.user.id;
    }

    const body = await request.json();
    const { roomId, teamId, cfHandle, problemId } = body;

    if (!roomId || !cfHandle || !problemId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const redis = await getRedis();
    
    // Resolve teamId if not provided: check which team contains this userId
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
        return NextResponse.json({ error: "User is not part of any team in this room" }, { status: 403 });
      }
    }

    const rateLimitKey = `ratelimit:sync:${userId}`;

    // 1. Check ratelimit
    const isRateLimited = await redis.exists(rateLimitKey);
    if (isRateLimited) {
      return NextResponse.json({ error: "Rate limit exceeded. Please wait 60 seconds." }, { status: 429 });
    }

    // 2. Set ratelimit (60s TTL)
    await redis.set(rateLimitKey, "1", { EX: 60 });

    // 3. Enqueue job
    const jobData = { roomId, userId, teamId: resolvedTeamId, cfHandle, problemId };
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
    // Set a TTL so it doesn't leak indefinitely (e.g., 1 hour)
    await redis.expire(syncStateKey, 3600);

    // 5. Publish event to user
    await publishUser(userId, { type: "sync.queued", position });

    // 6. Return 202
    return NextResponse.json({ queued: true }, { status: 202 });

  } catch (error: any) {
    logger.error("[/api/contests/sync] Error enqueuing sync job:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
