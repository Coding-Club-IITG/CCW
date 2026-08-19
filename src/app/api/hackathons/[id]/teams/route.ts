/**
 * GET  /api/hackathons/[id]/teams - List teams for a hackathon
 * POST /api/hackathons/[id]/teams - Create a team for a hackathon
 */

import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import {
  jsonObjectSchema,
  objectIdParamsSchema,
} from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import Hackathon from "@/models/Hackathon";
import HackathonTeam from "@/models/HackathonTeam";
import User from "@/models/User";
import mongoose from "mongoose";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const validatedParams = parseRouteParams(
      await params,
      objectIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;
    await dbConnect();

    const hackathon = await Hackathon.findById(id).lean();
    if (!hackathon) {
      return jsonError("NOT_FOUND", "Hackathon not found.");
    }

    const teams = await HackathonTeam.find({ hackathonId: id })
      .sort({ createdAt: -1 })
      .lean();

    // Populate member names
    const memberIds = [...new Set(teams.flatMap((t: any) => t.members))].filter(
      (id) => mongoose.Types.ObjectId.isValid(id as string),
    );
    const users = await User.find({ _id: { $in: memberIds } })
      .select("name pizza_count")
      .lean();
    const userMap = new Map((users as any[]).map((u) => [u._id.toString(), u]));

    const teamsWithMembers = teams.map((team: any) => ({
      ...team,
      memberDetails: team.members.map((mid: string) => {
        const u = userMap.get(mid);
        return u
          ? { id: mid, name: u.name, pizza_count: u.pizza_count }
          : { id: mid, name: "Unknown" };
      }),
    }));

    return jsonOk({ hackathon, teams: teamsWithMembers });
  } catch (err) {
    logger.error("Hackathon team listing failed", {
      route: "GET /api/hackathons/[id]/teams",
      operation: "list_teams",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const user = session.user as any;
    const validatedParams = parseRouteParams(
      await params,
      objectIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return jsonError("VALIDATION_ERROR", "Team name is required.");
    }

    await dbConnect();

    const hackathon = (await Hackathon.findById(id).lean()) as any;
    if (!hackathon || hackathon.status !== "active") {
      return jsonError(
        "VALIDATION_ERROR",
        "Hackathon not found or not active.",
      );
    }

    if (new Date(hackathon.deadline) < new Date()) {
      return jsonError("VALIDATION_ERROR", "Hackathon deadline has passed.");
    }

    // Check if user is already in a team for this hackathon
    const existingTeam = await HackathonTeam.findOne({
      hackathonId: id,
      members: user.id,
    });
    if (existingTeam) {
      return jsonError(
        "CONFLICT",
        "You are already in a team for this hackathon.",
      );
    }

    const teamStatus = hackathon.maxMembers === 1 ? "full" : "open";

    const team = await HackathonTeam.create({
      hackathonId: id,
      name: name.trim(),
      owner: user.id,
      members: [user.id],
      description: typeof description === "string" ? description.trim() : "",
      status: teamStatus,
    });

    return jsonOk({ team }, { status: 201 });
  } catch (err) {
    logger.error("Hackathon team creation failed", {
      route: "POST /api/hackathons/[id]/teams",
      operation: "create_team",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
