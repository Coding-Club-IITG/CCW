import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import CustomContest from "@/models/CustomContest";
import ContestRoom from "@/models/ContestRoom";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestTeam from "@/models/ContestTeam";
import CPUser from "@/models/CPUser";
import CFQuestion from "@/models/CFQuestion";
import { getRedis } from "@/lib/redis";
import mongoose from "mongoose";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contestId, teams } = body;

    if (!contestId || !teams || !Array.isArray(teams) || teams.length < 2) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Validate team sizes: each team must have 1 or 3 members
    const teamSizes = teams.map((t: any) => t.members.length);
    const validSizes = teamSizes.every((size: number) => size === 1 || size === 3);
    const consistentSizes = teamSizes.every((size: number) => size === teamSizes[0]);

    if (!validSizes || !consistentSizes) {
      return NextResponse.json(
        { 
          error: "Invalid team sizes",
          details: "Each team must have 1 or 3 members, and all teams must have the same size"
        },
        { status: 400 }
      );
    }

    await dbConnect();
    const contest = await CustomContest.findById(contestId);
    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    const problemCount = contest.bulkProblemCount || 3;
    const minRating = contest.bulkRatingMin || 800;
    const maxRating = contest.bulkRatingMax || 1200;

    // Collect all user IDs and fetch them to get solved problems
    const allUserIds = teams.flatMap(t => t.members);
    const users = await CPUser.find({ userId: { $in: allUserIds } });

    // Collect all solved problem IDs
    const solvedProblemIds = new Set<string>();
    for (const user of users) {
      if (user.solvedProblems) {
        for (const sp of user.solvedProblems) {
          solvedProblemIds.add(sp.problemId);
        }
      }
    }

    // Query MongoDB problem pool
    const availableProblems = await CFQuestion.aggregate([
      {
        $match: {
          rating: { $gte: minRating, $lte: maxRating },
          problemId: { $nin: Array.from(solvedProblemIds) }
        }
      },
      { $sample: { size: problemCount } }
    ]);

    if (availableProblems.length < problemCount) {
      return NextResponse.json({ 
        error: 'insufficient_problems', 
        minimumRatingRange: [minRating, maxRating] 
      }, { status: 400 });
    }

    // Write stub ContestRoom to MongoDB
    const room = new ContestRoom({
      contestId: contest._id,
      name: `Room for ${contest.name}`,
      status: "waiting",
      participants: allUserIds,
      currentProblemIndex: 0,
      firstSolvers: []
    });

    // Write stub ContestProblemSet
    const problemSet = new ContestProblemSet({
      contestId: contest._id,
      roomId: room._id,
      problems: availableProblems.map(p => ({
        platform: "codeforces",
        problemId: p.problemId,
        name: p.name,
        rating: p.rating,
        points: 100
      }))
    });

    // Create teams in MongoDB
    const teamSize = teamSizes[0]; // Already validated that all sizes are equal
    const createdTeams = [];
    for (const t of teams) {
      const team = new ContestTeam({
        roomId: room._id,
        name: t.name,
        members: t.members,
        teamSize,
        score: 0
      });
      await team.save();
      createdTeams.push(team);
    }
    room.teams = createdTeams.map(t => t._id);

    await room.save();
    await problemSet.save();

    const roomId = room._id.toString();

    const redis = await getRedis();
    
    // Write ordered problem array to room:<id>:problems
    const redisProblems = availableProblems.map(p => JSON.stringify({
      problemId: p.problemId,
      name: p.name,
      rating: p.rating,
      revealedAt: null
    }));
    await redis.del(`room:${roomId}:problems`);
    if (redisProblems.length > 0) {
      await redis.rPush(`room:${roomId}:problems`, redisProblems);
    }

    // Set room:<id>:state Hash
    const stateObj: any = {
      status: "waiting",
      type: contest.mode || "blitz",
      startTime: "",
      timeLimit: contest.durationSeconds.toString(),
      contestId: contestId.toString(),
      readyCount: 0
    };
    if (contest.mode !== "arena") {
      stateObj.currentProblem = 0;
    }
    await redis.hSet(`room:${roomId}:state`, stateObj);

    // Write room:<id>:teams Set
    await redis.sAdd(`room:${roomId}:teams`, createdTeams.map(t => t._id.toString()));

    // Write team:<teamId>:meta and team:<teamId>:users
    for (const t of createdTeams) {
      const tId = t._id.toString();
      await redis.hSet(`team:${tId}:meta`, { name: t.name, score: 0 });
      await redis.sAdd(`team:${tId}:users`, t.members.map((m: any) => m.toString()));
    }

    // Add roomId to contest:<contestId>:rooms Set
    await redis.sAdd(`contest:${contestId}:rooms`, roomId);

    return NextResponse.json({ roomId });
  } catch (error) {
    console.error("Room creation error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
