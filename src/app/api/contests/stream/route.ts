import { randomUUID } from "node:crypto";
import { Job } from "bullmq";
import { NextRequest } from "next/server";

import { authorizeContestView, authorizeRoomView } from "@/lib/access/contests";
import { parseSearchParams } from "@/lib/api/result";
import {
  boundaryErrorResponse,
  jsonError,
  jsonResult,
} from "@/lib/api/result.server";
import { contestStreamQuerySchema } from "@/lib/api/schemas/contestRoute";
import { auth } from "@/lib/auth/server";
import { publishRoom } from "@/lib/contests/events";
import {
  getRoomOnlineUserIds,
  updateRoomPresence,
} from "@/lib/contests/presence";
import { reconciliationQueue } from "@/lib/contests/queues";
import {
  contestRoomStateSchema,
  parseContestRoomProblems,
  roomActivitySchema,
} from "@/lib/contests/runtime";
import { getRedis } from "@/lib/db/redis";
import { webEnv } from "@/lib/env/web";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return jsonError("UNAUTHENTICATED", "Authentication required.");
    }

    const query = parseSearchParams(
      request.nextUrl.searchParams,
      contestStreamQuerySchema,
    );

    if (!query.ok) {
      return jsonResult(query);
    }

    const { contestId } = query.data;
    const { roomId } = query.data;
    const access = roomId
      ? await authorizeRoomView(roomId, session.user, contestId)
      : await authorizeContestView(contestId!, session.user);

    if (!access.ok) {
      return jsonResult(access);
    }

    const roomAccess = "room" in access.data ? access.data : null;
    const userId = session.user.id;
    const channel = roomId
      ? `events:room:${roomId}`
      : `events:contest:${contestId}`;
    const userChannel = `events:user:${userId}`;
    const channels = [
      channel,
      ...(roomAccess?.isParticipant ? [userChannel] : []),
    ];
    const redis = await getRedis();
    const subscriber = redis.duplicate();

    subscriber.on("error", (error) => {
      if (closed) {
        return;
      }

      logger.error("Contest stream subscriber failed", {
        operation: "subscribe",
        ...errorToLogMetadata(error),
      });
      void cleanup();
    });

    let closed = false;
    let interval: ReturnType<typeof setInterval> | undefined;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    let pending = Promise.resolve();
    let closing: Promise<void> | undefined;
    let present = false;
    const connection = {
      userId,
      id: randomUUID(),
      expirySeconds: webEnv.CONTEST_PRESENCE_EXPIRY_SECONDS,
    };
    const encoder = new TextEncoder();

    function send(event: string, data: unknown) {
      if (!closed) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }
    }

    function enqueue(operation: () => Promise<void>) {
      // Serialize setup and heartbeats so cleanup can wait for in-flight presence work
      pending = pending
        .then(async () => {
          if (!closed) {
            await operation();
          }
        })
        .catch((error) => {
          if (closed) {
            return;
          }

          logger.error("Contest stream operation failed", {
            operation: "stream",
            ...errorToLogMetadata(error),
          });
          void cleanup();
        });
    }

    // Recheck live permissions
    async function stillAllowed() {
      const current = await auth.api.getSession({ headers: request.headers });

      if (current?.user.id !== userId) {
        return false;
      }

      const result = roomId
        ? await authorizeRoomView(roomId, current.user, contestId)
        : await authorizeContestView(contestId!, current.user);

      if (!result.ok) {
        return false;
      }

      return (
        !roomAccess ||
        ("isSpectator" in result.data &&
          result.data.isSpectator === roomAccess.isSpectator)
      );
    }

    async function presence(operation: "refresh" | "remove") {
      if (!roomId || !roomAccess) {
        return;
      }

      const changes = await updateRoomPresence(
        roomId,
        roomAccess.isParticipant ? operation : "prune",
        roomAccess.isParticipant ? connection : undefined,
      );

      for (const joined of changes.joinedUserIds) {
        const job = await Job.fromId(
          reconciliationQueue,
          `disconnect-timeout-${roomId}-${joined}`,
        );

        if (job) {
          await job.remove();
        }

        await publishRoom(roomId, {
          type: "presence.online",
          userId: joined,
          cancelledForfeit: Boolean(job),
        });
      }

      for (const left of changes.leftUserIds) {
        const state = await redis.hGetAll(`room:${roomId}:state`);
        let activeTeams = 0;

        for (const teamId of await redis.sMembers(`room:${roomId}:teams`)) {
          const members = await redis.sMembers(`team:${teamId}:users`);

          if (
            members.some((member) => changes.onlineUserIds.includes(member))
          ) {
            activeTeams++;
          }
        }

        const timeout =
          state.status === "active" && activeTeams <= 1
            ? webEnv.DISCONNECT_FORFEIT_TIMEOUT_SECONDS
            : undefined;

        await publishRoom(roomId, {
          type: "presence.offline",
          userId: left,
          ...(timeout ? { forfeitTimeout: timeout } : {}),
        });

        if (timeout) {
          await reconciliationQueue.add(
            "mid_match_disconnect_timeout",
            {
              roomId,
              userId: left,
              contestId: String(roomAccess.room.contestId),
              trigger: "disconnect",
            },
            {
              delay: timeout * 1000,
              jobId: `disconnect-timeout-${roomId}-${left}`,
            },
          );
        }
      }

      return changes.onlineUserIds;
    }

    function cleanup(): Promise<void> {
      if (closing) {
        return closing;
      }

      closed = true;

      if (interval) {
        clearInterval(interval);
      }

      request.signal.removeEventListener("abort", abort);

      try {
        controller?.close();
      } catch {
        /* The reader may already have cancelled */
      }

      closing = (async () => {
        // Stop setup/reconnect attempts even if initialization is pending
        if (subscriber.isOpen) {
          subscriber.destroy();
        }

        await pending;

        try {
          if (present) {
            await presence("remove");
          }
        } catch (error) {
          logger.error("Contest presence cleanup failed", {
            operation: "disconnect",
            ...errorToLogMetadata(error),
          });
        }
      })();

      return closing;
    }

    function abort() {
      void cleanup();
    }

    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        request.signal.addEventListener("abort", abort, { once: true });

        if (request.signal.aborted) {
          void cleanup();

          return;
        }

        enqueue(async () => {
          await subscriber.connect();

          if (closed) {
            return;
          }

          await subscriber.subscribe(channels, (message, receivedChannel) => {
            enqueue(async () => {
              let payload: unknown;

              try {
                payload = JSON.parse(message);
              } catch {
                return;
              }

              if (
                receivedChannel === userChannel &&
                (!payload ||
                  typeof payload !== "object" ||
                  !("roomId" in payload) ||
                  payload.roomId !== roomId)
              ) {
                return;
              }

              if (!(await stillAllowed())) {
                void cleanup();

                return;
              }

              send("message", { channel: receivedChannel, payload });
            });
          });

          if (closed) {
            return;
          }

          if (!(await stillAllowed())) {
            void cleanup();

            return;
          }

          send("connected", { userId, subscribedChannels: channels });

          if (roomAccess && roomId) {
            present = roomAccess.isParticipant;
            await presence("refresh");

            const state = contestRoomStateSchema.parse(
              await redis.hGetAll(`room:${roomId}:state`),
            );

            state.status ??=
              roomAccess.room.status === "ended"
                ? "completed"
                : roomAccess.room.status;

            const scores: Record<string, number> = {};

            for (const team of roomAccess.room.teams) {
              scores[String(team)] = Number(
                (await redis.zScore(`room:${roomId}:scores`, String(team))) ??
                  0,
              );
            }

            const activityLogs = (
              await redis.lRange(`room:${roomId}:activity_logs`, 0, -1)
            ).flatMap((raw) => {
              try {
                const parsed = roomActivitySchema.safeParse(JSON.parse(raw));

                return parsed.success ? [parsed.data] : [];
              } catch {
                return [];
              }
            });
            const forfeitTimeouts: Record<string, number> = {};

            if (state.status === "active") {
              for (const participant of roomAccess.room.participants) {
                const job = await Job.fromId(
                  reconciliationQueue,
                  `disconnect-timeout-${roomId}-${participant}`,
                );

                if (job && (await job.getState()) === "delayed") {
                  forfeitTimeouts[String(participant)] =
                    job.timestamp + (job.opts.delay ?? 0);
                }
              }
            }

            // Send reconnect state only to this connection
            send("message", {
              channel,
              payload: {
                type: "room.state_sync",
                roomId,
                state,
                scores,
                activityLogs,
                forfeitTimeouts,
                problems:
                  state.status === "active" || state.status === "completed"
                    ? parseContestRoomProblems(
                        await redis.lRange(`room:${roomId}:problems`, 0, -1),
                      )
                    : [],
                locks:
                  state.type === "arena"
                    ? await redis.hGetAll(`room:${roomId}:locks`)
                    : {},
                readyUserIds: await redis.sMembers(
                  `room:${roomId}:ready_users`,
                ),
                onlineUserIds: await getRoomOnlineUserIds(roomId),
              },
            });
          } else {
            send("message", {
              channel,
              payload: { type: "contest.bracket_update" },
            });
          }

          if (!closed) {
            interval = setInterval(() => {
              enqueue(async () => {
                if (!(await stillAllowed())) {
                  void cleanup();

                  return;
                }

                const onlineUserIds = await presence("refresh");

                if (roomId) {
                  send("message", {
                    channel,
                    payload: { type: "presence.sync", roomId, onlineUserIds },
                  });
                }

                send("ping", { time: Date.now() });
              });
            }, webEnv.CONTEST_SSE_HEARTBEAT_SECONDS * 1000);
          }
        });
      },
      cancel: cleanup,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return boundaryErrorResponse("GET /api/contests/stream", error, request);
  }
}
