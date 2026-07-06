import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import dbConnect from "@/lib/mongodb";
import ContestMatch from "@/models/ContestMatch";
import { publishRoom } from "@/lib/sse";
import { reconciliationQueue } from "@/lib/bullmq";
import { logger } from "@/lib/utils";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    let userId = "";

    const testUserId = req.headers.get("x-test-user-id");
    if (process.env.NODE_ENV === "development" && testUserId) {
      userId = testUserId;
    } else {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session || !session.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = session.user.id;
    }
    
    // Await params for Next.js 15+
    const { id: roomId } = await params;

    await dbConnect();
    const room = await ContestRoom.findById(roomId);
    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (!room.participants.some((p: any) => p.toString() === userId)) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const redis = await getRedis();
    const state = await redis.hGetAll(`room:${roomId}:state`);
    
    if (!state || state.status !== "waiting") {
      return NextResponse.json({ error: "Room is not waiting" }, { status: 400 });
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
      return NextResponse.json({ error: "User is not part of any team" }, { status: 403 });
    }

    const readyAdded = await redis.sAdd(`room:${roomId}:ready_users`, userId);
    
    if (readyAdded) {
      // Publish individual ready state
      await publishRoom(roomId, {
        type: "room.user_ready",
        roomId,
        userId
      });

      // Check if this user's entire team is ready
      const teamMembers = await redis.sMembers(`team:${userTeamId}:users`);
      const readyMembers = [];
      for (const memberId of teamMembers) {
        const isReady = await redis.sIsMember(`room:${roomId}:ready_users`, memberId);
        if (isReady) {
          readyMembers.push(memberId);
        }
      }

      const teamReady = readyMembers.length === teamMembers.length;
      if (teamReady) {
        logger.info(`[Ready] Team ${userTeamId} is fully ready in room ${roomId}`);
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
          startTime: now.toString()
        });

        // Reveal problem(s) based on mode
        const problemsRaw = await redis.lRange(`room:${roomId}:problems`, 0, -1);
        if (state.type === "arena") {
          for (let i = 0; i < problemsRaw.length; i++) {
            const p = JSON.parse(problemsRaw[i]);
            p.revealedAt = now;
            await redis.lSet(`room:${roomId}:problems`, i, JSON.stringify(p));
          }
        } else {
          if (problemsRaw.length > 0) {
            const firstProblem = JSON.parse(problemsRaw[0]);
            firstProblem.revealedAt = now;
            await redis.lSet(`room:${roomId}:problems`, 0, JSON.stringify(firstProblem));
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
        const updatedProblems = await redis.lRange(`room:${roomId}:problems`, 0, -1);

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
          problems: updatedProblems.map(p => JSON.parse(p)),
          scores
        });

        // Enqueue time limit job
        const timeLimitSecs = parseInt(state.timeLimit || "3600", 10);
        await reconciliationQueue.add(
          "room_timeout",
          { roomId, contestId: state.contestId, trigger: "timeout" },
          { delay: timeLimitSecs * 1000, jobId: `timeout-${roomId}` }
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
          const timeoutSet = await redis.set(readyTimeoutKey, "1", { EX: 60, NX: true });
          
          if (timeoutSet) {
            // Timeout was just set, schedule a job to check if team became ready
            await reconciliationQueue.add(
              "team_ready_timeout",
              { roomId, teamId: userTeamId, contestId: state.contestId },
              { delay: 60000, jobId: `ready-timeout-${roomId}-${userTeamId}` }
            );
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Ready check error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
