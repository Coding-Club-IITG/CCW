import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import dbConnect from "@/lib/mongodb";
import ContestRoom from "@/models/ContestRoom";
import { logger } from "@/lib/utils";
import { publishRoom } from "@/lib/sse";
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
      status: "active",
    }).lean()
    : [];

  const redis = await getRedis();

  for (const room of activeRooms) {
    const roomId = room._id.toString();
    const presenceKey = `room:${roomId}:presence:${userId}`;
    await redis.set(presenceKey, "online");
    await redis.persist(presenceKey);

    // Remove the offline tracker key since the user is now online
    const offlineSentKey = `room:${roomId}:presence:${userId}:offline_sent`;
    await redis.del(offlineSentKey);

    // Clear any pending disconnect timeout jobs
    await reconciliationQueue.remove(`disconnect-timeout-${roomId}-${userId}`);

    // Publish online status
    await publishRoom(roomId, { type: "presence.online", userId });
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
        await redis.expire(presenceKey, 90);

        // Track that we sent the offline event immediately on disconnect
        const offlineSentKey = `room:${roomId}:presence:${userId}:offline_sent`;
        await redis.set(offlineSentKey, "1", { EX: 120 });

        // Publish offline status
        await publishRoom(roomId, { type: "presence.offline", userId });

        // Queue a mid-match disconnect timeout for 10 minutes (600,000 ms) in prod, 10s in dev
        const timeoutDelay = process.env.NODE_ENV === "development" ? 10000 : 600000;
        await reconciliationQueue.add(
          "mid_match_disconnect_timeout",
          { roomId, userId, contestId: room.contestId.toString(), trigger: "disconnect" },
          { delay: timeoutDelay, jobId: `disconnect-timeout-${roomId}-${userId}` }
        );
      }
    } catch (err) {
      logger.error("[SSE] Error setting presence expiration:", err);
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

      intervalId = setInterval(() => {
        sendEvent("ping", { time: Date.now() });
      }, 15000);

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
