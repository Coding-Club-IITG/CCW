import { NextRequest } from "next/server";

import {
  createProvisionedRoom,
  provisionProblems,
  ProblemAllocationError,
} from "@/lib/contests/provisioning";
import { synchronizeRoomRuntime } from "@/lib/contests/roomRuntime";

import { canManageContest } from "@/lib/access/contests";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { connectMongoDB } from "@/lib/db/mongodb";
import { auth } from "@/lib/auth/server";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";
import { parseJson } from "@/lib/api/result";
import { createContestRoomSchema } from "@/lib/api/schemas/contestRoute";

import ContestMatch from "@/models/ContestMatch";
import CPUser from "@/models/CPUser";

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

    if (contest.format === "bracket" || contest.status === "completed") {
      return jsonError("CONFLICT", "This contest cannot open a direct room.");
    }

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

    const allocation = await provisionProblems(contest, solvedProblemIds);
    const room = await createProvisionedRoom(
      contestId,
      teams,
      allocation.get("room")!,
      "waiting",
    );

    const roomId = room._id.toString();

    await synchronizeRoomRuntime(roomId);

    return jsonOk({ roomId });
  } catch (error) {
    if (error instanceof ProblemAllocationError)
      return jsonError("VALIDATION_ERROR", error.message);

    logger.error("Contest room creation failed", {
      route: "POST /api/contests/rooms",
      operation: "create_room",
      ...errorToLogMetadata(error),
    });

    return jsonError("INTERNAL_ERROR", "Internal server error");
  }
}
