import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import CustomContest from "@/models/CustomContest";
import CPUser from "@/models/CPUser";
import mongoose from "mongoose";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    // Support mock authentication for testing script
    const testUserId = request.headers.get("x-test-user-id");
    let userId: string;

    if (process.env.NODE_ENV === "development" && testUserId) {
      userId = testUserId;
    } else {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      userId = session.user.id;
    }

    await dbConnect();
    const contest = await CustomContest.findById(id);
    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }



    if (contest.status !== "registration") {
      return NextResponse.json({ error: "Contest not accepting registrations" }, { status: 400 });
    }

    const regSettings = contest.registrationSettings;
    if (!regSettings) {
      return NextResponse.json({ error: "Registration settings not found" }, { status: 400 });
    }

    if (new Date() > new Date(regSettings.deadline)) {
      return NextResponse.json({ error: "Registration deadline passed" }, { status: 400 });
    }

    const registrations = contest.registrations || [];

    if (contest.teamSize === 1) {
      // Solo Registration
      // Look up verified handle
      const cpUser = await CPUser.findOne({ userId });
      if (!cpUser || !cpUser.cfHandle) {
        return NextResponse.json({ error: "User must have a Codeforces handle" }, { status: 400 });
      }

      const result = await CustomContest.updateOne(
        {
          _id: id,
          "registrations.userId": { $ne: new mongoose.Types.ObjectId(userId) },
          $expr: { $lt: [{ $size: { $ifNull: ["$registrations", []] } }, regSettings.maxParticipants] }
        },
        {
          $push: {
            registrations: {
              userId: new mongoose.Types.ObjectId(userId),
              cfHandle: cpUser.cfHandle,
              registeredAt: new Date(),
            }
          }
        }
      );

      if (result.modifiedCount === 0) {
        return NextResponse.json({ error: "Could not register. Contest might be full or you are already registered." }, { status: 409 });
      }

      return NextResponse.json({ registered: true });
    } else if (contest.teamSize === 3) {
      // Team Registration
      const body = await request.json();
      const { teamName, memberIds } = body;

      if (!teamName || !memberIds || !Array.isArray(memberIds) || memberIds.length !== 3) {
        return NextResponse.json({ error: "teamName and memberIds array of size 3 are required" }, { status: 400 });
      }

      if (!memberIds.includes(userId)) {
        return NextResponse.json({ error: "Registrant must be part of the team members" }, { status: 400 });
      }

      // Check max limit
      if (registrations.length >= regSettings.maxParticipants) {
        return NextResponse.json({ error: "Contest is full" }, { status: 400 });
      }

      // Validate all members exist, have verified handles, and are not already registered
      const cpUsers = await CPUser.find({ userId: { $in: memberIds.map((id) => new mongoose.Types.ObjectId(id)) } });
      if (cpUsers.length !== 3) {
        return NextResponse.json({ error: "All 3 member users must exist" }, { status: 400 });
      }

      const allHaveHandles = cpUsers.every((u) => !!u.cfHandle);
      if (!allHaveHandles) {
        return NextResponse.json({ error: "All members must have a verified Codeforces handle" }, { status: 400 });
      }

      // Check registrations for duplicates (quick in-memory fail)
      const registeredUserIds = new Set(registrations.map((reg: any) => reg.userId.toString()));
      for (const memberId of memberIds) {
        if (registeredUserIds.has(memberId)) {
          return NextResponse.json({ error: "Member already registered" }, { status: 409 });
        }
      }

      const result = await CustomContest.updateOne(
        {
          _id: id,
          "registrations.userId": { $nin: memberIds.map((mid: string) => new mongoose.Types.ObjectId(mid)) },
          $expr: { $lt: [{ $size: { $ifNull: ["$registrations", []] } }, regSettings.maxParticipants - (contest.teamSize - 1)] }
        },
        {
          $push: {
            registrations: {
              $each: cpUsers.map((u) => ({
                userId: u.userId,
                cfHandle: u.cfHandle,
                teamName,
                registeredAt: new Date(),
              }))
            }
          }
        }
      );

      if (result.modifiedCount === 0) {
        return NextResponse.json({ error: "Could not register team. Contest might be full or members are already registered." }, { status: 409 });
      }

      return NextResponse.json({ registered: true });
    }

    return NextResponse.json({ error: "Unsupported teamSize format" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
