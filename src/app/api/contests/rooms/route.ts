import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import dbConnect from "@/lib/mongodb";
import ContestMatch from "@/models/ContestMatch";
import ContestRoom from "@/models/ContestRoom";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestTeam from "@/models/ContestTeam";
import CPUser from "@/models/CPUser";
import ContestQuestion from "@/models/ContestQuestion";
import { getRedis } from "@/lib/redis";
import mongoose from "mongoose";

import { auth } from "@/lib/auth";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { parseJson } from "@/lib/api/result";
import { createContestRoomSchema } from "@/lib/api/schemas/contestRoute";
import { webEnv } from "@/lib/env/web";

export async function POST(req: NextRequest) {
  try {
    const testUserId = req.headers.get("x-test-user-id");
    if (webEnv.NODE_ENV === "development" && testUserId) {
      // Dev bypass: skip session auth
    } else {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session || !session.user) {
        return jsonError("UNAUTHENTICATED", "Unauthorized");
      }
    }

    const body = await parseJson(req, createContestRoomSchema);
    if (!body.ok) return jsonResult(body);
    const { contestId, teams } = body.data;

    // Validate team sizes: each team must have 1 or 3 members
    const teamSizes = teams.map((team) => team.members.length);
    const validSizes = teamSizes.every(
      (size: number) => size === 1 || size === 3,
    );
    const consistentSizes = teamSizes.every(
      (size: number) => size === teamSizes[0],
    );

    if (!validSizes || !consistentSizes) {
      return jsonError("VALIDATION_ERROR", "Invalid team sizes");
    }

    await dbConnect();
    const contest = await ContestMatch.findById(contestId);
    if (!contest) {
      return jsonError("NOT_FOUND", "Contest not found");
    }

    const problemCount = contest.bulkProblemCount || 3;
    const minRating = contest.bulkRatingMin || 800;
    const maxRating = contest.bulkRatingMax || 1200;
    const minContestId = contest.bulkMinContestId || 0;

    // Collect all user IDs and fetch them to get solved problems
    const allUserIds = teams.flatMap((t) => t.members);
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
    const availableProblems = await ContestQuestion.aggregate([
      {
        $match: {
          rating: { $gte: minRating, $lte: maxRating },
          ...(minContestId > 0 ? { contestId: { $gte: minContestId } } : {}),
          problemId: { $nin: Array.from(solvedProblemIds) },
        },
      },
      { $sample: { size: problemCount } },
      { $sort: { rating: 1 } },
    ]);

    if (availableProblems.length < problemCount) {
      return jsonError("VALIDATION_ERROR", "insufficient_problems");
    }

    // Write stub ContestRoom to MongoDB
    const room = new ContestRoom({
      contestId: contest._id,
      name: `Room for ${contest.name}`,
      status: "waiting",
      participants: allUserIds,
      currentProblemIndex: 0,
      firstSolvers: [],
    });

    // Write stub ContestProblemSet
    const problemSet = new ContestProblemSet({
      contestId: contest._id,
      roomId: room._id,
      problems: availableProblems.map((p) => ({
        platform: "codeforces",
        problemId: p.problemId,
        name: p.name,
        rating: p.rating,
        points: Math.floor((p.rating || 1000) / 10),
      })),
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
        score: 0,
      });
      await team.save();
      createdTeams.push(team);
    }
    room.teams = createdTeams.map((t) => t._id);

    await room.save();
    await problemSet.save();

    const roomId = room._id.toString();

    const redis = await getRedis();

    // Write ordered problem array to room:<id>:problems
    const redisProblems = availableProblems.map((p) =>
      JSON.stringify({
        problemId: p.problemId,
        name: p.name,
        rating: p.rating,
        points: Math.floor((p.rating || 1000) / 10),
        revealedAt: null,
      }),
    );
    await redis.del(`room:${roomId}:problems`);
    if (redisProblems.length > 0) {
      await redis.rPush(`room:${roomId}:problems`, redisProblems);
    }

    // Set room:<id>:state Hash
    const stateObj: Record<string, string | number> = {
      status: "waiting",
      type: contest.mode || "blitz",
      startTime: "",
      timeLimit: (contest.durationSeconds ?? 3600).toString(),
      contestId: contestId.toString(),
      readyCount: 0,
    };
    if (contest.mode !== "arena") {
      stateObj.currentProblem = 0;
    }
    await redis.hSet(`room:${roomId}:state`, stateObj);

    // Write room:<id>:teams Set
    await redis.sAdd(
      `room:${roomId}:teams`,
      createdTeams.map((t) => t._id.toString()),
    );

    // Write team:<teamId>:meta and team:<teamId>:users
    for (const t of createdTeams) {
      const tId = t._id.toString();
      await redis.hSet(`team:${tId}:meta`, { name: t.name, score: 0 });
      await redis.sAdd(
        `team:${tId}:users`,
        t.members.map((member) => member.toString()),
      );
    }

    // Add roomId to contest:<contestId>:rooms Set
    await redis.sAdd(`contest:${contestId}:rooms`, roomId);

    return jsonOk({ roomId });
  } catch (error) {
    logger.error("Contest room creation failed", {
      route: "POST /api/contests/rooms",
      operation: "create_room",
      ...errorToLogMetadata(error),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error");
  }
}
