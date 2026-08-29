import { NextRequest } from "next/server";
import { jsonError, jsonResult } from "@/lib/api/result.server";
import { auth } from "@/lib/auth";
import { webEnv } from "@/lib/env/web";
import { getRedis } from "@/lib/redis";
import { logger } from "@/lib/utils";
import dbConnect from "@/lib/mongodb";
import ContestRoom from "@/models/ContestRoom";
import { publishRoom, publishUser } from "@/lib/contests/events";
import { reconciliationQueue } from "@/lib/contests/queues";
import {
  contestRoomStateSchema,
  parseContestRoomProblems,
} from "@/lib/contests/runtime";
import { parseSearchParams } from "@/lib/api/result";
import { contestStreamQuerySchema } from "@/lib/api/schemas/contestRoute";

export const dynamic = "force-dynamic";

const SYNC_EVENT_RECOVERY_WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return jsonError("UNAUTHENTICATED", "Unauthorized");
  }
  const userId = session.user.id;

  const query = parseSearchParams(
    request.nextUrl.searchParams,
    contestStreamQuerySchema,
  );
  if (!query.ok) return jsonResult(query);

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

    const stateObj = contestRoomStateSchema.parse(
      await redis.hGetAll(`room:${roomId}:state`),
    );
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
        const job = await Job.fromId(
          reconciliationQueue,
          `disconnect-timeout-${roomId}`,
        );
        if (job) {
          await job.remove();
          cancelled = true;
        }
      }
    }

    // Publish online status
    await publishRoom(roomId, {
      type: "presence.online",
      userId,
      cancelledForfeit: cancelled,
    });

    // Send a full state resync directly to the reconnecting user so they catch up on any
    // changes that happened while they were disconnected (missed SSE events).
    if (currentStatus === "active" || currentStatus === "waiting") {
      try {
        const problemsRaw = await redis.lRange(
          `room:${roomId}:problems`,
          0,
          -1,
        );
        const problems = parseContestRoomProblems(problemsRaw);

        const allTeams = await redis.sMembers(`room:${roomId}:teams`);
        const scores: Record<string, number> = {};
        for (const tId of allTeams) {
          const s = await redis.zScore(`room:${roomId}:scores`, tId);
          scores[tId] = s ? parseFloat(s.toString()) : 0;
        }

        const locks =
          stateObj.type === "arena"
            ? await redis.hGetAll(`room:${roomId}:locks`)
            : {};

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

  const contestIdFromQuery = query.data.contestId;
  if (contestIdFromQuery) {
    const contestChannel = `events:contest:${contestIdFromQuery}`;
    if (!channels.includes(contestChannel)) {
      channels.push(contestChannel);
    }
  }

  const roomIdFromQuery = query.data.roomId ?? query.data.rooms;
  if (roomIdFromQuery) {
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
              const isOnline = await redis.exists(
                `room:${roomId}:presence:${mId}`,
              );
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
            const timeoutSeconds = webEnv.DISCONNECT_FORFEIT_TIMEOUT_SECONDS;

            // Publish offline status with timeout warning
            await publishRoom(roomId, {
              type: "presence.offline",
              userId,
              forfeitTimeout: timeoutSeconds,
            });

            await reconciliationQueue.add(
              "mid_match_disconnect_timeout",
              {
                roomId,
                userId,
                contestId: room.contestId.toString(),
                trigger: "disconnect",
              },
              {
                delay: timeoutSeconds * 1000,
                jobId: `disconnect-timeout-${roomId}`,
              },
            );
          } else {
            // Publish offline status without scheduling forfeit
            await publishRoom(roomId, { type: "presence.offline", userId });
          }
        } else {
          // If room is not active (Eg. waiting), just publish offline status normally
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
      const sendEvent = (event: string, data: unknown) => {
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

      logger.info("Contest SSE client connected", {
        route: "GET /api/contests/stream",
        operation: "subscribe",
        contestId: contestIdFromQuery ?? undefined,
        channelCount: channels.length,
      });

      try {
        await subscriber.subscribe(channels, (message, channel) => {
          let parsed = message;
          try {
            parsed = JSON.parse(message);
          } catch (e) {}
          sendEvent("message", { channel, payload: parsed });
        });

        // A mock verification can finish before this new SSE connection is
        // subscribed. Replay a recent terminal sync result after subscribing
        // so the client never remains stuck in its loading state.
        for (const room of activeRooms) {
          const roomId = room._id.toString();
          const syncState = await redis.hGetAll(`sync:${roomId}:${userId}`);
          const completedAt = Number(syncState.completedAt);
          if (
            !completedAt ||
            Date.now() - completedAt > SYNC_EVENT_RECOVERY_WINDOW_MS ||
            !syncState.problemId ||
            !syncState.verdict
          ) {
            continue;
          }

          const payload =
            syncState.status === "detected"
              ? {
                  type: "sync.detected" as const,
                  problemId: syncState.problemId,
                  verdict: syncState.verdict,
                  pointsAwarded: syncState.pointsAwarded
                    ? Number(syncState.pointsAwarded)
                    : null,
                }
              : syncState.status === "failed"
                ? {
                    type: "sync.failed" as const,
                    problemId: syncState.problemId,
                    verdict: syncState.verdict,
                  }
                : null;
          if (payload) {
            sendEvent("message", {
              channel: `events:user:${userId}`,
              payload,
            });
          }
        }
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
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
