import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import dbConnect from "@/lib/mongodb";
import ContestRoom from "@/models/ContestRoom";
import { logger } from "@/lib/utils";
import { publishRoom, publishUser } from "@/lib/sse";
import { reconciliationQueue } from "@/lib/bullmq";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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

  await dbConnect();

  const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(userId);
  const activeRooms = isValidObjectId
    ? await ContestRoom.find({
      participants: userId,
      status: { $in: ["waiting", "active"] },
    }).lean()
    : [];

  const redis = await getRedis();

  for (const room of activeRooms) {
    const roomId = room._id.toString();
    const presenceKey = `room:${roomId}:presence:${userId}`;
    await redis.set(presenceKey, "online");
    await redis.persist(presenceKey);

    const stateObj = await redis.hGetAll(`room:${roomId}:state`);
    const currentStatus = stateObj?.status || "unknown";

    let cancelled = false;

    if (currentStatus === "active") {
      const allTeams = await redis.sMembers(`room:${roomId}:teams`);
      let activeTeamsCount = 0;
      
      for (const tId of allTeams) {
        const members = await redis.sMembers(`team:${tId}:users`);
        let isTeamActive = false;
        for (const mId of members) {
          const isOnline = await redis.exists(`room:${roomId}:presence:${mId}`);
          if (isOnline) {
            isTeamActive = true;
            break;
          }
        }
        if (isTeamActive) {
          activeTeamsCount++;
        }
      }

      if (activeTeamsCount > 1) {
        const { Job } = await import("bullmq");
        const job = await Job.fromId(reconciliationQueue, `disconnect-timeout-${roomId}`);
        if (job) {
          await job.remove();
          cancelled = true;
        }
      }
    }

    // Publish online status
    await publishRoom(roomId, { type: "presence.online", userId, cancelledForfeit: cancelled });

    // Send a full state resync directly to the reconnecting user so they catch up on any
    // changes that happened while they were disconnected (missed SSE events).
    if (currentStatus === "active" || currentStatus === "waiting") {
      try {
        const problemsRaw = await redis.lRange(`room:${roomId}:problems`, 0, -1);
        const problems = problemsRaw.map((p: string) => JSON.parse(p));

        const allTeams = await redis.sMembers(`room:${roomId}:teams`);
        const scores: Record<string, number> = {};
        for (const tId of allTeams) {
          const s = await redis.zScore(`room:${roomId}:scores`, tId);
          scores[tId] = s ? parseFloat(s.toString()) : 0;
        }

        const locks = stateObj.type === "arena" ? await redis.hGetAll(`room:${roomId}:locks`) : {};

        await publishUser(userId, {
          type: "room.state_sync",
          roomId,
          state: stateObj,
          problems,
          scores,
          locks,
        });
      } catch (syncErr) {
        logger.error("[SSE] Failed to send reconnect state_sync:", syncErr);
      }
    }
  }

  const channels = [`events:user:${userId}`];
  for (const room of activeRooms) {
    const roomId = room._id.toString();
    const contestId = room.contestId.toString();
    channels.push(`events:room:${roomId}`);
    channels.push(`events:contest:${contestId}`);
  }

  const contestIdFromQuery = request.nextUrl.searchParams.get("contestId");
  if (contestIdFromQuery && /^[0-9a-fA-F]{24}$/.test(contestIdFromQuery)) {
    const contestChannel = `events:contest:${contestIdFromQuery}`;
    if (!channels.includes(contestChannel)) {
      channels.push(contestChannel);
    }
  }

  const roomIdFromQuery = request.nextUrl.searchParams.get("roomId") || request.nextUrl.searchParams.get("rooms");
  if (roomIdFromQuery && /^[0-9a-fA-F]{24}$/.test(roomIdFromQuery)) {
    const roomChannel = `events:room:${roomIdFromQuery}`;
    if (!channels.includes(roomChannel)) {
      channels.push(roomChannel);
    }
  }

  const subscriber = redis.duplicate();
  await subscriber.connect();

  let isClosed = false;

  let intervalId: NodeJS.Timeout | null = null;

  const cleanup = async () => {
    if (isClosed) return;
    isClosed = true;
    if (intervalId) clearInterval(intervalId);

    try {
      await subscriber.unsubscribe();
      await subscriber.disconnect();
    } catch (err) {
      logger.error("[SSE] Error disconnecting subscriber client:", err);
    }

    try {
      for (const room of activeRooms) {
        const roomId = room._id.toString();
        const presenceKey = `room:${roomId}:presence:${userId}`;
        
        // Delete presence immediately instead of setting an expiration
        await redis.del(presenceKey);

        const stateObj = await redis.hGetAll(`room:${roomId}:state`);
        const currentStatus = stateObj?.status || "unknown";

        if (currentStatus === "active") {
          const allTeams = await redis.sMembers(`room:${roomId}:teams`);
          let activeTeamsCount = 0;
          
          for (const tId of allTeams) {
            const members = await redis.sMembers(`team:${tId}:users`);
            let isTeamActive = false;
            for (const mId of members) {
              const isOnline = await redis.exists(`room:${roomId}:presence:${mId}`);
              if (isOnline) {
                isTeamActive = true;
                break;
              }
            }
            if (isTeamActive) {
              activeTeamsCount++;
            }
          }

          if (activeTeamsCount <= 1) {
            const timeoutSeconds = parseInt(process.env.DISCONNECT_FORFEIT_TIMEOUT_SECONDS || "60", 10);
            
            // Publish offline status with timeout warning
            await publishRoom(roomId, { type: "presence.offline", userId, forfeitTimeout: timeoutSeconds });
            
            await reconciliationQueue.add(
              "mid_match_disconnect_timeout",
              { roomId, userId, contestId: room.contestId.toString(), trigger: "disconnect" },
              { delay: timeoutSeconds * 1000, jobId: `disconnect-timeout-${roomId}` }
            );
          } else {
            // Publish offline status without scheduling forfeit
            await publishRoom(roomId, { type: "presence.offline", userId });
          }
        } else {
          // If room is not active (e.g., waiting), just publish offline status normally
          await publishRoom(roomId, { type: "presence.offline", userId });
        }
      }
    } catch (err) {
      logger.error("[SSE] Error processing disconnect logic:", err);
    }
  };

  request.signal.addEventListener("abort", () => {
    cleanup();
  });

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        if (isClosed) return;
        try {
          const formatted = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(formatted));
        } catch (e) {
          cleanup();
        }
      };

      if (!isClosed) {
        intervalId = setInterval(() => {
          sendEvent("ping", { time: Date.now() });
        }, 15000);
      }

      sendEvent("connected", {
        userId,
        subscribedChannels: channels,
      });

      console.log(`[SSE] Client ${userId} connected. Subscribing to channels:`, channels);

      try {
        await subscriber.subscribe(channels, (message, channel) => {
          let parsed = message;
          try {
            parsed = JSON.parse(message);
          } catch (e) {
          }
          sendEvent("message", { channel, payload: parsed });
        });
      } catch (err) {
        logger.error("[SSE] Failed to subscribe to Redis channels:", err);
        controller.error(err);
        await cleanup();
      }
    },
    async cancel() {
      await cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
