/**
 * PATCH /api/hackathons/requests/[id] - Accept or reject a request
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
import Hackathon from "@/models/Hackathon";
import { notify } from "@/lib/notify";
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

    const { action } = body;
    if (action !== "accept" && action !== "reject") {
      return jsonError(
        "VALIDATION_ERROR",
        "Action must be 'accept' or 'reject'.",
      );
    }

    await dbConnect();

    const req = (await HackathonRequest.findById(id).lean()) as any;
    if (!req || req.status !== "pending") {
      return jsonError("NOT_FOUND", "Request not found or already resolved.");
    }

    const team = (await HackathonTeam.findById(req.teamId).lean()) as any;
    if (!team) {
      return jsonError("NOT_FOUND", "Team not found.");
    }

    const hackathon = (await Hackathon.findById(req.hackathonId).lean()) as any;

    // Authorization: who can accept/reject?
    if (req.type === "join_request") {
      // Only team owner can accept/reject join requests
      if (team.owner !== user.id) {
        return jsonError("FORBIDDEN", "Forbidden");
      }
    } else {
      // Only the invited user can accept/reject invites
      if (req.toUserId !== user.id) {
        return jsonError("FORBIDDEN", "Forbidden");
      }
    }

    if (action === "reject") {
      await HackathonRequest.findByIdAndUpdate(id, { status: "rejected" });

      // Notify the requester
      const notifyUserId =
        req.type === "join_request" ? req.fromUserId : req.fromUserId;
      await notify({
        userId: notifyUserId,
        type: "request_rejected",
        title: "Request Rejected",
        message: `Your ${req.type === "join_request" ? "join request" : "invite"} for team "${team.name}" was rejected.`,
        link: `/internal/hackathons/${req.hackathonId}`,
      });

      return jsonOk({ status: "rejected" });
    }

    // Accept: add user to team
    const userToAdd =
      req.type === "join_request" ? req.fromUserId : req.toUserId;

    // Check if user is already in a team for this hackathon (race condition guard)
    const existingTeam = await HackathonTeam.findOne({
      hackathonId: req.hackathonId,
      members: userToAdd,
    });
    if (existingTeam) {
      await HackathonRequest.findByIdAndUpdate(id, { status: "rejected" });
      return jsonError(
        "CONFLICT",
        "User is already in a team for this hackathon.",
      );
    }

    // Atomic update: push member only if team isn't full
    const maxMembers = hackathon?.maxMembers || 999;
    const updated = await HackathonTeam.findOneAndUpdate(
      {
        _id: req.teamId,
        $expr: { $lt: [{ $size: "$members" }, maxMembers] },
      },
      { $push: { members: userToAdd } },
      { returnDocument: "after" },
    );

    if (!updated) {
      await HackathonRequest.findByIdAndUpdate(id, { status: "rejected" });
      return jsonError("CONFLICT", "Team is already full.");
    }

    // Update team status if now full
    if (updated.members.length >= maxMembers) {
      await HackathonTeam.findByIdAndUpdate(req.teamId, { status: "full" });
    }

    await HackathonRequest.findByIdAndUpdate(id, { status: "accepted" });

    // Reject all other pending requests for this user in this hackathon
    await HackathonRequest.updateMany(
      {
        hackathonId: req.hackathonId,
        $or: [
          { fromUserId: userToAdd, type: "join_request" },
          { toUserId: userToAdd, type: "invite" },
        ],
        status: "pending",
        _id: { $ne: req._id },
      },
      { status: "rejected" },
    );

    // Notify
    const notifyUserId =
      req.type === "join_request" ? req.fromUserId : req.toUserId;
    await notify({
      userId: notifyUserId,
      type: "request_accepted",
      title: "Request Accepted",
      message: `You've been added to team "${team.name}" for ${hackathon?.name || "a hackathon"}.`,
      link: `/internal/hackathons/${req.hackathonId}`,
    });

    return jsonOk({ status: "accepted" });
  } catch (err) {
    logger.error("Hackathon request update failed", {
      route: "PATCH /api/hackathons/requests/[id]",
      operation: "update_request",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
