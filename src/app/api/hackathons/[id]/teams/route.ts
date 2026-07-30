/**
 * GET  /api/hackathons/[id]/teams - List teams for a hackathon
 * POST /api/hackathons/[id]/teams - Create a team for a hackathon
 */

import { NextRequest, NextResponse } from "next/server";
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const hackathon = await Hackathon.findById(id).lean();
    if (!hackathon) {
      return NextResponse.json(
        { error: "Hackathon not found." },
        { status: 404 },
      );
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

    return NextResponse.json({ hackathon, teams: teamsWithMembers });
  } catch (err) {
    logger.error("Hackathon team listing failed", {
      route: "GET /api/hackathons/[id]/teams",
      operation: "list_teams",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    const { id } = await params;

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const { name, description } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Team name is required." },
        { status: 400 },
      );
    }

    await dbConnect();

    const hackathon = (await Hackathon.findById(id).lean()) as any;
    if (!hackathon || hackathon.status !== "active") {
      return NextResponse.json(
        { error: "Hackathon not found or not active." },
        { status: 400 },
      );
    }

    if (new Date(hackathon.deadline) < new Date()) {
      return NextResponse.json(
        { error: "Hackathon deadline has passed." },
        { status: 400 },
      );
    }

    // Check if user is already in a team for this hackathon
    const existingTeam = await HackathonTeam.findOne({
      hackathonId: id,
      members: user.id,
    });
    if (existingTeam) {
      return NextResponse.json(
        { error: "You are already in a team for this hackathon." },
        { status: 400 },
      );
    }

    const teamStatus = hackathon.maxMembers === 1 ? "full" : "open";

    const team = await HackathonTeam.create({
      hackathonId: id,
      name: name.trim(),
      owner: user.id,
      members: [user.id],
      description: (description || "").trim(),
      status: teamStatus,
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (err) {
    logger.error("Hackathon team creation failed", {
      route: "POST /api/hackathons/[id]/teams",
      operation: "create_team",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
