import { NextRequest } from "next/server";

import { configureRoomTiming } from "@/lib/contests/roomTiming";
import { synchronizeRoomRuntime } from "@/lib/contests/roomRuntime";

import { canManageContest } from "@/lib/access/contests";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { connectMongoDB } from "@/lib/db/mongodb";
import { auth } from "@/lib/auth/server";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";
import { parseJson } from "@/lib/api/result";
import { createContestRoomSchema } from "@/lib/api/schemas/contestRoute";
import { fetchContestProblemContent } from "@/lib/contests/problemContent";

import ContestMatch from "@/models/ContestMatch";
import ContestRoom from "@/models/ContestRoom";
import ContestProblemSet from "@/models/ContestProblemSet";
import ContestTeam from "@/models/ContestTeam";
import CPUser from "@/models/CPUser";
import ContestQuestion from "@/models/ContestQuestion";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session || !session.user) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
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

    await connectMongoDB();

    const contest = await ContestMatch.findById(contestId);

    if (!contest) {
      return jsonError("NOT_FOUND", "Contest not found");
    }

    const creatorProfile = await CPUser.findOne({ userId: session.user.id })
      .select("_id")
      .lean();

    if (
      !canManageContest(contest, session.user, creatorProfile?._id.toString())
    ) {
      return jsonError(
        "FORBIDDEN",
        "Only the creator or an administrator can create contest rooms.",
      );
    }

    const problemCount = contest.bulkProblemCount || 3;
    const minRating = Math.max(contest.bulkRatingMin || 800, 1);
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
          rating: {
            $exists: true,
            $ne: null,
            $gt: 0,
            $gte: minRating,
            $lte: maxRating,
          },
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

    const problemsWithContent = await Promise.all(
      availableProblems.map(async (problem) => ({
        problem,
        content: await fetchContestProblemContent({
          platform: "codeforces",
          problemId: problem.problemId,
        }),
      })),
    );

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
      problems: problemsWithContent.map(({ problem, content }) => ({
        platform: "codeforces",
        problemId: problem.problemId,
        name: content?.title || problem.name,
        rating: problem.rating,
        points: Math.floor((problem.rating || 1000) / 10),
        ...content,
      })),
    });

    // Create teams in MongoDB
    const teamSize = teamSizes[0]; // Already validated that all sizes are equal
    const createdTeams = [];

    for (const t of teams) {
      const team = new ContestTeam({
        contestId: contest._id,
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
    configureRoomTiming(room, contest);

    await room.save();
    await problemSet.save();

    const roomId = room._id.toString();

    await synchronizeRoomRuntime(roomId);

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
