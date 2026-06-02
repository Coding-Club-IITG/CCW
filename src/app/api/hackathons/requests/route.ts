/**
 * POST /api/hackathons/requests - Create a join request or invite
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Hackathon from "@/models/Hackathon";
import HackathonTeam from "@/models/HackathonTeam";
import HackathonRequest from "@/models/HackathonRequest";
import type { HackathonRequestType } from "@/lib/constants";
import { notify } from "@/lib/notify";
import { paginatedResponse, parsePagination } from "@/lib/pagination";

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const { teamId, type, toUserId } = body;

    if (!teamId || !type) {
      return NextResponse.json(
        { error: "teamId and type are required." },
        { status: 400 },
      );
    }

    if (type !== "join_request" && type !== "invite") {
      return NextResponse.json(
        { error: "Invalid request type." },
        { status: 400 },
      );
    }

    await dbConnect();

    const team = (await HackathonTeam.findById(teamId).lean()) as any;
    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    if (team.status === "full" || team.status === "closed") {
      return NextResponse.json(
        { error: "Team is not accepting members." },
        { status: 400 },
      );
    }

    const hackathon = (await Hackathon.findById(
      team.hackathonId,
    ).lean()) as any;
    if (!hackathon || hackathon.status !== "active") {
      return NextResponse.json(
        { error: "Hackathon is not active." },
        { status: 400 },
      );
    }

    if (new Date(hackathon.deadline) < new Date()) {
      return NextResponse.json(
        { error: "Hackathon deadline has passed." },
        { status: 400 },
      );
    }

    const requestType = type as HackathonRequestType;

    if (requestType === "join_request") {
      // User wants to join a team
      if (team.members.includes(user.id)) {
        return NextResponse.json(
          { error: "You are already a member of this team." },
          { status: 400 },
        );
      }

      // Check if user is already in another team for this hackathon
      const existingTeam = await HackathonTeam.findOne({
        hackathonId: team.hackathonId,
        members: user.id,
      });
      if (existingTeam) {
        return NextResponse.json(
          { error: "You are already in a team for this hackathon." },
          { status: 400 },
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
        return NextResponse.json(
          { error: "You already have a pending request for this team." },
          { status: 400 },
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

      return NextResponse.json({ request: req }, { status: 201 });
    } else {
      // Invite: team owner invites a user
      if (team.owner !== user.id) {
        return NextResponse.json(
          { error: "Only the team owner can send invites." },
          { status: 403 },
        );
      }

      if (!toUserId) {
        return NextResponse.json(
          { error: "toUserId is required for invites." },
          { status: 400 },
        );
      }

      if (toUserId === user.id) {
        return NextResponse.json(
          { error: "You cannot invite yourself." },
          { status: 400 },
        );
      }

      if (team.members.includes(toUserId)) {
        return NextResponse.json(
          { error: "User is already a member of this team." },
          { status: 400 },
        );
      }

      // Check if target user is already in a team for this hackathon
      const existingTeam = await HackathonTeam.findOne({
        hackathonId: team.hackathonId,
        members: toUserId,
      });
      if (existingTeam) {
        return NextResponse.json(
          { error: "User is already in a team for this hackathon." },
          { status: 400 },
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
        return NextResponse.json(
          { error: "An invite is already pending for this user." },
          { status: 400 },
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

      return NextResponse.json({ request: req }, { status: 201 });
    }
  } catch (err) {
    console.error("[Hackathon Requests] POST error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });
    const teamId = searchParams.get("teamId");

    let filter: Record<string, any> = {};

    if (teamId) {
      const team = (await HackathonTeam.findById(teamId).lean()) as any;
      if (!team || team.owner !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    return NextResponse.json({
      ...paginatedResponse(requests, total, page, limit),
      users,
    });
  } catch (err) {
    console.error("[Hackathon Requests] GET error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
