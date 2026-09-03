import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import dbConnect from "@/lib/mongodb";
import ContestMatch from "@/models/ContestMatch";
import { publishRoom } from "@/lib/contests/events";
import { reconciliationQueue } from "@/lib/contests/queues";
import {
  contestRoomProblemSchema,
  contestRoomStateSchema,
  parseContestRoomProblems,
} from "@/lib/contests/runtime";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { parseRouteParams } from "@/lib/api/result";
import { contestIdParamsSchema } from "@/lib/api/schemas/contestRoute";
import {
  appendRoomActivityLog,
} from "@/lib/contests/activityLog";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }
    const userId = session.user.id;

    const validatedParams = parseRouteParams(
      await params,
      contestIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id: roomId } = validatedParams.data;

    await dbConnect();
    const room = await ContestRoom.findById(roomId);
    if (!room) {
      return jsonError("NOT_FOUND", "Room not found");
    }

    if (
      !room.participants.some(
        (participant) => participant.toString() === userId,
      )
    ) {
      return jsonError("FORBIDDEN", "Not a participant");
    }

    const redis = await getRedis();
    const state = contestRoomStateSchema.parse(
      await redis.hGetAll(`room:${roomId}:state`),
    );

    if (!state || state.status !== "waiting") {
      return jsonError("VALIDATION_ERROR", "Room is not waiting");
    }

    // Determine which team this user belongs to
    const teams = await redis.sMembers(`room:${roomId}:teams`);
    let userTeamId: string | null = null;
    for (const tId of teams) {
      const isMember = await redis.sIsMember(`team:${tId}:users`, userId);
      if (isMember) {
        userTeamId = tId;
        break;
      }
    }

    if (!userTeamId) {
      return jsonError("FORBIDDEN", "User is not part of any team");
    }

    const readyAdded = await redis.sAdd(`room:${roomId}:ready_users`, userId);

    if (readyAdded) {
      // Publish individual ready state
      await publishRoom(roomId, {
        type: "room.user_ready",
        roomId,
        userId,
      });

      // Log to activity feed — resolve team display name from metadata
      const readyTeamName = (await redis.hGet(`team:${userTeamId}:meta`, "name")) ?? "A player";
      await appendRoomActivityLog(redis, roomId, {
        icon: "person",
        text: `${readyTeamName} is ready.`,
        color: "text-secondary",
        timestamp: Date.now(),
        eventType: "room.user_ready",
      });

      // Check if this user's entire team is ready
      const teamMembers = await redis.sMembers(`team:${userTeamId}:users`);
      const readyMembers = [];
      for (const memberId of teamMembers) {
        const isReady = await redis.sIsMember(
          `room:${roomId}:ready_users`,
          memberId,
        );
        if (isReady) {
          readyMembers.push(memberId);
        }
      }

      const teamReady = readyMembers.length === teamMembers.length;
      if (teamReady) {
        logger.info(
          `[Ready] Team ${userTeamId} is fully ready in room ${roomId}`,
        );
        await redis.sAdd(`room:${roomId}:teams_ready`, userTeamId);
      }

      // Check if all teams are ready
      const teamsReady = await redis.sMembers(`room:${roomId}:teams_ready`);
      const allTeamsReady = teamsReady.length === teams.length;

      if (allTeamsReady) {
        // Room start
        const now = Date.now();
        await redis.hSet(`room:${roomId}:state`, {
          status: "active",
          startTime: now.toString(),
        });

        // Reveal problem(s) based on mode
        const problemsRaw = await redis.lRange(
          `room:${roomId}:problems`,
          0,
          -1,
        );
        if (state.type === "arena") {
          for (let i = 0; i < problemsRaw.length; i++) {
            const p = contestRoomProblemSchema.parse(
              JSON.parse(problemsRaw[i]),
            );
            p.revealedAt = now;
            await redis.lSet(`room:${roomId}:problems`, i, JSON.stringify(p));
          }
        } else {
          if (problemsRaw.length > 0) {
            const firstProblem = contestRoomProblemSchema.parse(
              JSON.parse(problemsRaw[0]),
            );
            firstProblem.revealedAt = now;
            await redis.lSet(
              `room:${roomId}:problems`,
              0,
              JSON.stringify(firstProblem),
            );
          }
        }

        room.status = "active";
        room.actualStartTime = new Date(now);
        await room.save();

        if (state.contestId) {
          const contest = await ContestMatch.findById(state.contestId);
          if (contest) {
            contest.status = "active";
            await contest.save();
          }
        }

        const updatedState = await redis.hGetAll(`room:${roomId}:state`);
        const updatedProblems = await redis.lRange(
          `room:${roomId}:problems`,
          0,
          -1,
        );

        // Fetch scores
        const scores: Record<string, number> = {};
        for (const tId of teams) {
          const score = await redis.zScore(`room:${roomId}:scores`, tId);
          scores[tId] = score || 0;
        }

        // Publish state sync
        await publishRoom(roomId, {
          type: "room.state_sync",
          roomId,
          state: updatedState,
          problems: parseContestRoomProblems(updatedProblems),
          scores,
        });

        // Log match start to activity feed
        await appendRoomActivityLog(redis, roomId, {
          icon: "info",
          text: "Arena match started! Good luck.",
          color: "text-on-surface",
          timestamp: Date.now(),
          eventType: "room.state_sync",
        });

        // Enqueue time limit job
        const timeLimitSecs = parseInt(state.timeLimit || "3600", 10);
        await reconciliationQueue.add(
          "room_timeout",
          { roomId, contestId: state.contestId, trigger: "timeout" },
          { delay: timeLimitSecs * 1000, jobId: `timeout-${roomId}` },
        );
      } else if (!teamReady) {
        // Find format safely
        let format = "unknown";
        if (state.contestId) {
          const contest = await ContestMatch.findById(state.contestId);
          if (contest) format = contest.format;
        }

        if (format !== "bracket") {
          // Set a timeout for this team to become ready (60s)
          const readyTimeoutKey = `ready_timeout:${roomId}:${userTeamId}`;
          const timeoutSet = await redis.set(readyTimeoutKey, "1", {
            EX: 60,
            NX: true,
          });

          if (timeoutSet) {
            // Timeout was just set, schedule a job to check if team became ready
            await reconciliationQueue.add(
              "team_ready_timeout",
              { roomId, teamId: userTeamId, contestId: state.contestId },
              { delay: 60000, jobId: `ready-timeout-${roomId}-${userTeamId}` },
            );
          }
        }
      }
    }

    return jsonOk({ success: true });
  } catch (err) {
    logger.error("Contest room ready check failed", {
      route: "POST /api/contests/rooms/[id]/ready",
      operation: "mark_ready",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error");
  }
}
