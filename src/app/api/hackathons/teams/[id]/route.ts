/**
 * PATCH  /api/hackathons/teams/[id] - Update team or remove member (owner only)
 * DELETE /api/hackathons/teams/[id] - Delete team (owner only)
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
import HackathonTeam from "@/models/HackathonTeam";
import HackathonRequest from "@/models/HackathonRequest";
import { notify, notifyMany } from "@/lib/notify";
import { errorToLogMetadata, logger } from "@/lib/utils";

export async function PATCH(
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

    await dbConnect();

    const team = await HackathonTeam.findById(id);
    if (!team) {
      return jsonError("NOT_FOUND", "Team not found.");
    }

    if (team.owner !== user.id) {
      return jsonError("FORBIDDEN", "Only the team owner can manage the team.");
    }

    // Remove member action
    if (body.action === "remove_member" && body.memberId) {
      const memberId = body.memberId as string;
      if (memberId === team.owner) {
        return jsonError("VALIDATION_ERROR", "Cannot remove the team owner.");
      }
      if (!team.members.includes(memberId)) {
        return jsonError(
          "VALIDATION_ERROR",
          "User is not a member of this team.",
        );
      }

      await HackathonTeam.findByIdAndUpdate(id, {
        $pull: { members: memberId },
        status: "open",
      });

      // Notify the removed member
      await notify({
        userId: memberId,
        type: "team_removed",
        title: "Removed from Team",
        message: `You have been removed from team "${team.name}".`,
        link: `/internal/hackathons/${team.hackathonId}`,
      });

      return jsonOk({ success: true });
    }

    // Toggle team open/closed status
    if (body.action === "toggle_status") {
      const Hackathon = (await import("@/models/Hackathon")).default;
      const hackathon = (await Hackathon.findById(
        team.hackathonId,
      ).lean()) as any;
      const maxMembers = hackathon?.maxMembers || 999;

      if (team.members.length >= maxMembers) {
        return jsonError(
          "VALIDATION_ERROR",
          "Cannot open team - max members reached.",
        );
      }

      const newStatus = team.status === "open" ? "closed" : "open";
      await HackathonTeam.findByIdAndUpdate(id, { status: newStatus });
      return jsonOk({ success: true, status: newStatus });
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
      return jsonError("VALIDATION_ERROR", "Nothing to update.");
    }

    const updated = await HackathonTeam.findByIdAndUpdate(id, update, {
      returnDocument: "after",
    }).lean();
    return jsonOk({ team: updated });
  } catch (err) {
    logger.error("Hackathon team update failed", {
      route: "PATCH /api/hackathons/teams/[id]",
      operation: "update_team",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

export async function DELETE(
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

    await dbConnect();

    const team = await HackathonTeam.findById(id);
    if (!team) {
      return jsonError("NOT_FOUND", "Team not found.");
    }

    if (team.owner !== user.id) {
      return jsonError("FORBIDDEN", "Only the team owner can delete the team.");
    }

    // Delete the team and all associated requests
    await HackathonTeam.findByIdAndDelete(id);
    await HackathonRequest.deleteMany({ teamId: id });

    // Notify all other team members about deletion
    const otherMembers = team.members.filter((m: string) => m !== user.id);
    if (otherMembers.length > 0) {
      await notifyMany(otherMembers, {
        type: "team_deleted",
        title: "Team Deleted",
        message: `Team "${team.name}" has been deleted by the owner.`,
        link: `/internal/hackathons/${team.hackathonId}`,
      });
    }

    return jsonOk({ success: true });
  } catch (err) {
    logger.error("Hackathon team deletion failed", {
      route: "DELETE /api/hackathons/teams/[id]",
      operation: "delete_team",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
