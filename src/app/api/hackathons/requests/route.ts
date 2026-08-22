/**
 * POST /api/hackathons/requests - Create a join request or invite
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseJson, parseSearchParams } from "@/lib/api/result";
import {
  jsonObjectSchema,
  paginationQueryFields,
} from "@/lib/api/schemas/boundary";
import { objectIdStringSchema } from "@/lib/api/schemas/contestRoute";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Hackathon from "@/models/Hackathon";
import HackathonTeam from "@/models/HackathonTeam";
import HackathonRequest from "@/models/HackathonRequest";
import type { HackathonRequestType } from "@/lib/constants";
import { notify } from "@/lib/notify";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { errorToLogMetadata, logger } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const user = session.user;

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    const { teamId, type, toUserId } = body;

    if (!teamId || !type) {
      return jsonError("VALIDATION_ERROR", "teamId and type are required.");
    }

    if (type !== "join_request" && type !== "invite") {
      return jsonError("VALIDATION_ERROR", "Invalid request type.");
    }

    await dbConnect();

    const team = (await HackathonTeam.findById(teamId).lean()) as any;
    if (!team) {
      return jsonError("NOT_FOUND", "Team not found.");
    }

    if (team.status === "full" || team.status === "closed") {
      return jsonError("VALIDATION_ERROR", "Team is not accepting members.");
    }

    const hackathon = (await Hackathon.findById(
      team.hackathonId,
    ).lean()) as any;
    if (!hackathon || hackathon.status !== "active") {
      return jsonError("VALIDATION_ERROR", "Hackathon is not active.");
    }

    if (new Date(hackathon.deadline) < new Date()) {
      return jsonError("VALIDATION_ERROR", "Hackathon deadline has passed.");
    }

    const requestType = type as HackathonRequestType;

    if (requestType === "join_request") {
      // User wants to join a team
      if (team.members.includes(user.id)) {
        return jsonError("CONFLICT", "You are already a member of this team.");
      }

      // Check if user is already in another team for this hackathon
      const existingTeam = await HackathonTeam.findOne({
        hackathonId: team.hackathonId,
        members: user.id,
      });
      if (existingTeam) {
        return jsonError(
          "CONFLICT",
          "You are already in a team for this hackathon.",
        );
      }

      // Check for existing pending request
      const existing = await HackathonRequest.findOne({
        teamId,
        fromUserId: user.id,
        type: "join_request",
        status: "pending",
      });
      if (existing) {
        return jsonError(
          "CONFLICT",
          "You already have a pending request for this team.",
        );
      }

      const req = await HackathonRequest.create({
        teamId,
        hackathonId: team.hackathonId,
        fromUserId: user.id,
        toUserId: team.owner,
        type: "join_request",
        status: "pending",
      });

      // Notify team owner
      await notify({
        userId: team.owner,
        type: "join_request",
        title: "New Join Request",
        message: `${user.name} wants to join your team "${team.name}" for ${hackathon.name}.`,
        link: `/internal/hackathons/${hackathon._id}`,
      });

      return jsonOk({ request: req }, { status: 201 });
    } else {
      // Invite: team owner invites a user
      if (team.owner !== user.id) {
        return jsonError("FORBIDDEN", "Only the team owner can send invites.");
      }

      if (typeof toUserId !== "string" || !toUserId) {
        return jsonError(
          "VALIDATION_ERROR",
          "toUserId is required for invites.",
        );
      }

      if (toUserId === user.id) {
        return jsonError("VALIDATION_ERROR", "You cannot invite yourself.");
      }

      if (team.members.includes(toUserId)) {
        return jsonError("CONFLICT", "User is already a member of this team.");
      }

      // Check if target user is already in a team for this hackathon
      const existingTeam = await HackathonTeam.findOne({
        hackathonId: team.hackathonId,
        members: toUserId,
      });
      if (existingTeam) {
        return jsonError(
          "CONFLICT",
          "User is already in a team for this hackathon.",
        );
      }

      // Check for existing pending invite
      const existing = await HackathonRequest.findOne({
        teamId,
        toUserId,
        type: "invite",
        status: "pending",
      });
      if (existing) {
        return jsonError(
          "CONFLICT",
          "An invite is already pending for this user.",
        );
      }

      const req = await HackathonRequest.create({
        teamId,
        hackathonId: team.hackathonId,
        fromUserId: user.id,
        toUserId,
        type: "invite",
        status: "pending",
      });

      // Notify invited user
      await notify({
        userId: toUserId,
        type: "team_invite",
        title: "Team Invite",
        message: `You've been invited to join team "${team.name}" for ${hackathon.name}.`,
        link: `/internal/hackathons/${hackathon._id}`,
      });

      return jsonOk({ request: req }, { status: 201 });
    }
  } catch (err) {
    logger.error("Hackathon request creation failed", {
      route: "POST /api/hackathons/requests",
      operation: "create_request",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const user = session.user;
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(
      searchParams,
      z.object({
        ...paginationQueryFields,
        teamId: objectIdStringSchema.optional(),
      }),
    );
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });
    const teamId = query.data.teamId;

    let filter: Record<string, any> = {};

    if (teamId) {
      const team = (await HackathonTeam.findById(teamId).lean()) as any;
      if (!team || team.owner !== user.id) {
        return jsonError("FORBIDDEN", "Forbidden");
      }
      filter = { teamId, type: "join_request", status: "pending" };
    } else {
      filter = {
        $or: [
          { toUserId: user.id, type: "invite", status: "pending" },
          { fromUserId: user.id },
        ],
      };
    }

    const [requests, total] = await Promise.all([
      HackathonRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HackathonRequest.countDocuments(filter),
    ]);

    let users: Record<string, { name: string; pizza_count: number }> = {};
    if (teamId && requests.length > 0) {
      const User = (await import("@/models/User")).default;
      const userIds = requests.map((r: any) => r.fromUserId);
      const userDocs = await User.find({ _id: { $in: userIds } })
        .select("_id name pizza_count")
        .lean();
      for (const u of userDocs as any[]) {
        users[u._id.toString()] = {
          name: u.name,
          pizza_count: u.pizza_count || 0,
        };
      }
    }

    return jsonOk({
      ...paginatedResponse(requests, total, page, limit),
      users,
    });
  } catch (err) {
    logger.error("Hackathon request listing failed", {
      route: "GET /api/hackathons/requests",
      operation: "list_requests",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
