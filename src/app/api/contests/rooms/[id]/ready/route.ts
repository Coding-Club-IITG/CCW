import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRedis } from "@/lib/redis";
import ContestRoom from "@/models/ContestRoom";
import dbConnect from "@/lib/mongodb";
import { publishRoom } from "@/lib/sse";
import { reconciliationQueue } from "@/lib/bullmq";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    let userId = "";

    if (process.env.NODE_ENV === "development" && req.headers.get("x-test-user-id")) {
      userId = req.headers.get("x-test-user-id")!;
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

    if (!room.participants.includes(userId as any)) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    const redis = await getRedis();
    const state = await redis.hGetAll(`room:${roomId}:state`);
    
    if (!state || state.status !== "waiting") {
      return NextResponse.json({ error: "Room is not waiting" }, { status: 400 });
    }

    // Use a Redis set to track unique users who are ready
    const readyAdded = await redis.sAdd(`room:${roomId}:ready_users`, userId);
    
    if (readyAdded) {
      const readyCount = await redis.sCard(`room:${roomId}:ready_users`);
      await redis.hSet(`room:${roomId}:state`, { readyCount });

      // Assuming 1v1 for now (2 participants total)
      // For teams, we might check room.participants.length
      const totalParticipants = room.participants.length;

      if (readyCount === totalParticipants) {
        // Room start (Task 4)
        const now = Date.now();
        await redis.hSet(`room:${roomId}:state`, {
          status: "active",
          startTime: now.toString()
        });

        // Reveal problem[0]
        const problemsRaw = await redis.lRange(`room:${roomId}:problems`, 0, -1);
        if (problemsRaw.length > 0) {
          const firstProblem = JSON.parse(problemsRaw[0]);
          firstProblem.revealedAt = now;
          await redis.lSet(`room:${roomId}:problems`, 0, JSON.stringify(firstProblem));
        }

        room.status = "active";
        await room.save();

        const updatedState = await redis.hGetAll(`room:${roomId}:state`);
        const updatedProblems = await redis.lRange(`room:${roomId}:problems`, 0, -1);

        // Fetch scores
        const teams = await redis.sMembers(`room:${roomId}:teams`);
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
          { delay: timeLimitSecs * 1000, jobId: `timeout:${roomId}` }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Ready check error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
