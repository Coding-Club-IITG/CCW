/**
 * PATCH /api/hackathons/requests/[id] - Accept or reject a request
 */

import mongoose from "mongoose";
import { NextRequest } from "next/server";

import {
  err as appError,
  ok,
  parseJson,
  parseRouteParams,
} from "@/lib/api/result";
import { jsonError, jsonResult } from "@/lib/api/result.server";
import {
  jsonObjectSchema,
  objectIdParamsSchema,
} from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth/server";
import { connectMongoDB } from "@/lib/db/mongodb";
import { notify, type NotificationData } from "@/lib/notifications/service";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import Hackathon from "@/models/Hackathon";
import HackathonRequest from "@/models/HackathonRequest";
import HackathonTeam from "@/models/HackathonTeam";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return jsonError("UNAUTHENTICATED", "Unauthorized");
    const validatedParams = parseRouteParams(
      await params,
      objectIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;
    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const { action } = parsedBody.data;
    if (action !== "accept" && action !== "reject") {
      return jsonError(
        "VALIDATION_ERROR",
        "Action must be 'accept' or 'reject'.",
      );
    }

    await connectMongoDB();
    const dbSession = await mongoose.startSession();
    try {
      const outcome = await dbSession.withTransaction(async () => {
        const req = await HackathonRequest.findById(id)
          .session(dbSession)
          .lean();
        if (!req || req.status !== "pending") {
          return {
            result: appError(
              "NOT_FOUND",
              "Request not found or already resolved.",
            ),
            notification: null,
          };
        }
        const team = await HackathonTeam.findById(req.teamId)
          .session(dbSession)
          .lean();
        if (!team || String(team.hackathonId) !== String(req.hackathonId)) {
          return {
            result: appError("NOT_FOUND", "Team not found."),
            notification: null,
          };
        }
        // Only team owners can resolve join requests
        if (
          (req.type === "join_request" && team.owner !== session.user.id) ||
          (req.type === "invite" && req.toUserId !== session.user.id)
        ) {
          return {
            result: appError("FORBIDDEN", "Forbidden"),
            notification: null,
          };
        }

        if (action === "reject") {
          await HackathonRequest.updateOne(
            { _id: id, status: "pending" },
            { status: "rejected" },
            { session: dbSession },
          );
          // Notify the requester
          const notification: NotificationData = {
            userId: req.fromUserId,
            type: "request_rejected",
            title: "Request Rejected",
            message: `Your ${req.type === "join_request" ? "join request" : "invite"} for team "${team.name}" was rejected.`,
            link: `/internal/hackathons/${req.hackathonId}`,
          };
          return { result: ok({ status: "rejected" as const }), notification };
        }

        // Writing the parent serializes accepts with changes to its lifecycle
        const hackathon = await Hackathon.findOneAndUpdate(
          {
            _id: req.hackathonId,
            status: "active",
            deadline: { $gte: new Date() },
          },
          { $inc: { __v: 1 } },
          { session: dbSession, returnDocument: "after" },
        ).lean();
        if (!hackathon) {
          return {
            result: appError(
              "VALIDATION_ERROR",
              "Hackathon is inactive or its deadline has passed.",
            ),
            notification: null,
          };
        }
        if (team.status === "closed") {
          return {
            result: appError("CONFLICT", "Team is not accepting members."),
            notification: null,
          };
        }
        // Accept: add the requester for a join request, or the recipient for an invite
        const userToAdd =
          req.type === "join_request" ? req.fromUserId : req.toUserId;
        // Check existing membership
        const existingTeam = await HackathonTeam.findOne({
          hackathonId: req.hackathonId,
          members: userToAdd,
        }).session(dbSession);
        if (existingTeam) {
          await HackathonRequest.updateOne(
            { _id: id, status: "pending" },
            { status: "rejected" },
            { session: dbSession },
          );
          return {
            result: appError(
              "CONFLICT",
              "User is already in a team for this hackathon.",
            ),
            notification: null,
          };
        }
        // Atomically add a member
        const updated = await HackathonTeam.findOneAndUpdate(
          {
            _id: req.teamId,
            status: "open",
            members: { $ne: userToAdd },
            $expr: { $lt: [{ $size: "$members" }, hackathon.maxMembers] },
          },
          { $addToSet: { members: userToAdd } },
          { session: dbSession, returnDocument: "after" },
        );
        if (!updated) {
          await HackathonRequest.updateOne(
            { _id: id, status: "pending" },
            { status: "rejected" },
            { session: dbSession },
          );
          return {
            result: appError("CONFLICT", "Team is already full."),
            notification: null,
          };
        }
        // Mark a team full
        if (updated.members.length >= hackathon.maxMembers) {
          await HackathonTeam.updateOne(
            { _id: req.teamId },
            { status: "full" },
            { session: dbSession },
          );
        }
        await HackathonRequest.updateOne(
          { _id: id, status: "pending" },
          { status: "accepted" },
          { session: dbSession },
        );
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
          { session: dbSession },
        );
        const notification: NotificationData = {
          userId: userToAdd,
          type: "request_accepted",
          title: "Request Accepted",
          message: `You've been added to team "${team.name}" for ${hackathon.name}.`,
          link: `/internal/hackathons/${req.hackathonId}`,
        };
        return { result: ok({ status: "accepted" as const }), notification };
      });
      if (!outcome) throw new Error("Request transaction returned no result.");
      if (outcome.notification) await notify(outcome.notification);
      return jsonResult<{ status: "accepted" | "rejected" }>(outcome.result);
    } finally {
      await dbSession.endSession();
    }
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return jsonError(
        "CONFLICT",
        "User is already in a team for this hackathon.",
      );
    }
    logger.error("Hackathon request update failed", {
      route: "PATCH /api/hackathons/requests/[id]",
      operation: "update_request",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
