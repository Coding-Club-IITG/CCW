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
  storedActivityEntrySchema,
} from "@/lib/contests/runtime";
import { getDisplayName } from "@/lib/contests/names";
import { appendActivityLog } from "@/lib/contests/activityLog";
import { parseSearchParams } from "@/lib/api/result";
import { contestStreamQuerySchema } from "@/lib/api/schemas/contestRoute";

export const dynamic = "force-dynamic";

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
  
  const initialSyncEvents: any[] = [];

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

    let displayName = "Unknown";
    let teamIdForUser: string | null = null;
    const allTeamsForName = await redis.sMembers(`room:${roomId}:teams`);
    for (const tId of allTeamsForName) {
      const isMember = await redis.sIsMember(`team:${tId}:users`, userId);
      if (isMember) {
        teamIdForUser = tId;
        break;
      }
    }
    displayName = await getDisplayName(redis, userId, teamIdForUser);


    const text = cancelled
      ? `${displayName} reconnected. Forfeiture cancelled.`
      : `${displayName} connected${currentStatus === "waiting" ? " (Not Ready)" : ""}.`;

    await appendActivityLog(redis, `room:${roomId}:activity_log`, {
      icon: "person",
      text,
      color: "text-secondary",
      eventType: "presence.online"
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

        const sharedLogRaw = await redis.lRange(`room:${roomId}:activity_log`, 0, 49);
        const userLogRaw = await redis.lRange(`room:${roomId}:activity_log:${userId}`, 0, 49);
        
        const mergedLog = [...sharedLogRaw, ...userLogRaw]
          .map(str => {
            try { return storedActivityEntrySchema.parse(JSON.parse(str)); }
            catch (e) { return null; }
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50);

        initialSyncEvents.push({
          channel: `events:user:${userId}`,
          payload: {
            type: "room.state_sync",
            roomId,
            state: stateObj,
            problems,
            scores,
            locks,
            activityLog: mergedLog,
          }
        });
      } catch (syncErr) {
        logger.error("[SSE] Failed to prepare reconnect state_sync:", syncErr);
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

            let displayName = "Unknown";
            let teamIdForUser: string | null = null;
            const allTeamsForName = await redis.sMembers(`room:${roomId}:teams`);
            for (const tId of allTeamsForName) {
              const isMember = await redis.sIsMember(`team:${tId}:users`, userId);
              if (isMember) {
                teamIdForUser = tId;
                break;
              }
            }
            displayName = await getDisplayName(redis, userId, teamIdForUser);
            await appendActivityLog(redis, `room:${roomId}:activity_log`, {
              icon: "person_off",
              text: `${displayName} disconnected. Match will be forfeited in ${timeoutSeconds}s.`,
              color: "text-error",
              eventType: "presence.offline"
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

            let displayName = "Unknown";
            let teamIdForUser: string | null = null;
            const allTeamsForName = await redis.sMembers(`room:${roomId}:teams`);
            for (const tId of allTeamsForName) {
              const isMember = await redis.sIsMember(`team:${tId}:users`, userId);
              if (isMember) {
                teamIdForUser = tId;
                break;
              }
            }
            displayName = await getDisplayName(redis, userId, teamIdForUser);
            await appendActivityLog(redis, `room:${roomId}:activity_log`, {
              icon: "person_off",
              text: `${displayName} disconnected.`,
              color: "text-error",
              eventType: "presence.offline"
            });
          }
        } else {
          // If room is not active (Eg. waiting), just publish offline status normally
          await publishRoom(roomId, { type: "presence.offline", userId });
          
          let displayName = "Unknown";
          let teamIdForUser: string | null = null;
          const allTeamsForName = await redis.sMembers(`room:${roomId}:teams`);
          for (const tId of allTeamsForName) {
            const isMember = await redis.sIsMember(`team:${tId}:users`, userId);
            if (isMember) {
              teamIdForUser = tId;
              break;
            }
          }
          displayName = await getDisplayName(redis, userId, teamIdForUser);
          await appendActivityLog(redis, `room:${roomId}:activity_log`, {
            icon: "person_off",
            text: `${displayName} disconnected.`,
            color: "text-error",
            eventType: "presence.offline"
          });
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
        
        // Send the initial state syncs now that the connection is fully established
        for (const ev of initialSyncEvents) {
          sendEvent("message", ev);
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
