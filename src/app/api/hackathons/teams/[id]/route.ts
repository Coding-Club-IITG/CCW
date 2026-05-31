/**
 * PATCH  /api/hackathons/teams/[id] - Update team or remove member (owner only)
 * DELETE /api/hackathons/teams/[id] - Delete team (owner only)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import HackathonTeam from "@/models/HackathonTeam";
import HackathonRequest from "@/models/HackathonRequest";
import Notification from "@/models/Notification";

export async function PATCH(
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

    await dbConnect();

    const team = await HackathonTeam.findById(id);
    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    if (team.owner !== user.id) {
      return NextResponse.json(
        { error: "Only the team owner can manage the team." },
        { status: 403 },
      );
    }

    // Remove member action
    if (body.action === "remove_member" && body.memberId) {
      const memberId = body.memberId as string;
      if (memberId === team.owner) {
        return NextResponse.json(
          { error: "Cannot remove the team owner." },
          { status: 400 },
        );
      }
      if (!team.members.includes(memberId)) {
        return NextResponse.json(
          { error: "User is not a member of this team." },
          { status: 400 },
        );
      }

      await HackathonTeam.findByIdAndUpdate(id, {
        $pull: { members: memberId },
        status: "open",
      });

      // Notify the removed member
      await Notification.create({
        userId: memberId,
        type: "team_removed",
        title: "Removed from Team",
        message: `You have been removed from team "${team.name}".`,
        link: `/internal/hackathons/${team.hackathonId}`,
      });

      return NextResponse.json({ success: true });
    }

    // Toggle team open/closed status
    if (body.action === "toggle_status") {
      const Hackathon = (await import("@/models/Hackathon")).default;
      const hackathon = (await Hackathon.findById(
        team.hackathonId,
      ).lean()) as any;
      const maxMembers = hackathon?.maxMembers || 999;

      if (team.members.length >= maxMembers) {
        return NextResponse.json(
          { error: "Cannot open team — max members reached." },
          { status: 400 },
        );
      }

      const newStatus = team.status === "open" ? "closed" : "open";
      await HackathonTeam.findByIdAndUpdate(id, { status: newStatus });
      return NextResponse.json({ success: true, status: newStatus });
    }

    // Regular update (name/description)
    const update: Record<string, any> = {};
    if (
      body.name !== undefined &&
      typeof body.name === "string" &&
      body.name.trim().length > 0
    ) {
      update.name = body.name.trim();
    }
    if (
      body.description !== undefined &&
      typeof body.description === "string"
    ) {
      update.description = body.description.trim();
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 },
      );
    }

    const updated = await HackathonTeam.findByIdAndUpdate(id, update, {
      new: true,
    }).lean();
    return NextResponse.json({ team: updated });
  } catch (err) {
    console.error("[Hackathon Teams] PATCH error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    await dbConnect();

    const team = await HackathonTeam.findById(id);
    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    if (team.owner !== user.id) {
      return NextResponse.json(
        { error: "Only the team owner can delete the team." },
        { status: 403 },
      );
    }

    // Delete the team and all associated requests
    await HackathonTeam.findByIdAndDelete(id);
    await HackathonRequest.deleteMany({ teamId: id });

    // Notify all other team members about deletion
    const otherMembers = team.members.filter((m: string) => m !== user.id);
    if (otherMembers.length > 0) {
      await Notification.insertMany(
        otherMembers.map((memberId: string) => ({
          userId: memberId,
          type: "team_deleted",
          title: "Team Deleted",
          message: `Team "${team.name}" has been deleted by the owner.`,
          link: `/internal/hackathons/${team.hackathonId}`,
        })),
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Hackathon Teams] DELETE error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
