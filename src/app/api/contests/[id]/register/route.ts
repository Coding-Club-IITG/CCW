import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import ContestMatch from "@/models/ContestMatch";
import CPUser from "@/models/CPUser";
import mongoose from "mongoose";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { webEnv } from "@/lib/env/web";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import {
  contestIdParamsSchema,
  teamRegistrationSchema,
} from "@/lib/api/schemas/contestRoute";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const validatedParams = parseRouteParams(
      await params,
      contestIdParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;

    // Support mock authentication for testing script
    const testUserId = request.headers.get("x-test-user-id");
    let userId: string;

    if (webEnv.NODE_ENV === "development" && testUserId) {
      userId = testUserId;
    } else {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        return jsonError("UNAUTHENTICATED", "Unauthorized");
      }
      userId = session.user.id;
    }

    await dbConnect();
    const contest = await ContestMatch.findById(id);
    if (!contest) {
      return jsonError("NOT_FOUND", "Contest not found");
    }

    if (contest.status !== "registration") {
      return jsonError(
        "VALIDATION_ERROR",
        "Contest not accepting registrations",
      );
    }

    const regSettings = contest.registrationSettings;
    if (!regSettings) {
      return jsonError("VALIDATION_ERROR", "Registration settings not found");
    }

    if (new Date() > new Date(regSettings.deadline)) {
      return jsonError("VALIDATION_ERROR", "Registration deadline passed");
    }

    const registrations = contest.registrations || [];

    if (contest.teamSize === 1) {
      // Solo Registration
      // Look up verified handle
      const cpUser = await CPUser.findOne({ userId });
      if (!cpUser || !cpUser.cfHandle) {
        return jsonError(
          "VALIDATION_ERROR",
          "User must have a Codeforces handle",
        );
      }

      const result = await ContestMatch.updateOne(
        {
          _id: id,
          "registrations.userId": { $ne: new mongoose.Types.ObjectId(userId) },
          $expr: {
            $lt: [
              { $size: { $ifNull: ["$registrations", []] } },
              regSettings.maxParticipants,
            ],
          },
        },
        {
          $push: {
            registrations: {
              userId: new mongoose.Types.ObjectId(userId),
              cfHandle: cpUser.cfHandle,
              registeredAt: new Date(),
            },
          },
        },
      );

      if (result.modifiedCount === 0) {
        return jsonError(
          "CONFLICT",
          "Could not register. Contest might be full or you are already registered.",
        );
      }

      return jsonOk({ registered: true });
    } else if (contest.teamSize === 3) {
      // Team Registration
      const body = await parseJson(request, teamRegistrationSchema);
      if (!body.ok) return jsonResult(body);
      const { teamName, memberIds } = body.data;

      if (!memberIds.includes(userId)) {
        return jsonError(
          "VALIDATION_ERROR",
          "Registrant must be part of the team members",
        );
      }

      // Check max limit
      if (registrations.length >= regSettings.maxParticipants) {
        return jsonError("VALIDATION_ERROR", "Contest is full");
      }

      // Validate all members exist, have verified handles, and are not already registered
      const cpUsers = await CPUser.find({
        userId: { $in: memberIds.map((id) => new mongoose.Types.ObjectId(id)) },
      });
      if (cpUsers.length !== 3) {
        return jsonError("VALIDATION_ERROR", "All 3 member users must exist");
      }

      const allHaveHandles = cpUsers.every((u) => !!u.cfHandle);
      if (!allHaveHandles) {
        return jsonError(
          "VALIDATION_ERROR",
          "All members must have a verified Codeforces handle",
        );
      }

      // Check registrations for duplicates (quick in-memory fail)
      const registeredUserIds = new Set(
        registrations.map((reg: any) => reg.userId.toString()),
      );
      for (const memberId of memberIds) {
        if (registeredUserIds.has(memberId)) {
          return jsonError("CONFLICT", "Member already registered");
        }
      }

      const result = await ContestMatch.updateOne(
        {
          _id: id,
          "registrations.userId": {
            $nin: memberIds.map(
              (mid: string) => new mongoose.Types.ObjectId(mid),
            ),
          },
          $expr: {
            $lt: [
              { $size: { $ifNull: ["$registrations", []] } },
              regSettings.maxParticipants - (contest.teamSize - 1),
            ],
          },
        },
        {
          $push: {
            registrations: {
              $each: cpUsers.map((u) => ({
                userId: u.userId,
                cfHandle: u.cfHandle,
                teamName,
                registeredAt: new Date(),
              })),
            },
          },
        },
      );

      if (result.modifiedCount === 0) {
        return jsonError(
          "CONFLICT",
          "Could not register team. Contest might be full or members are already registered.",
        );
      }

      return jsonOk({ registered: true });
    }

    return jsonError("VALIDATION_ERROR", "Unsupported teamSize format");
  } catch (error) {
    logger.error("Contest registration failed", {
      route: "POST /api/contests/[id]/register",
      operation: "register",
      ...errorToLogMetadata(error),
    });
    return jsonError(
      "INTERNAL_ERROR",
      "Unable to complete contest registration.",
    );
  }
}
