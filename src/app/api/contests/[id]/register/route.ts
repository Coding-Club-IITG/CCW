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

    if (testUserId) {
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

    // TODO: Revert this back to registration only being available for knockout contests
    // if (contest.format !== "bracket") {
    //   return NextResponse.json({ error: "Registration only available for knockout contests" }, { status: 400 });
    // }

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
      if (registrations.length >= regSettings.maxParticipants) {
        return NextResponse.json({ error: "Contest is full" }, { status: 400 });
      }

      // Check duplicate
      const alreadyRegistered = registrations.some((reg: any) => reg.userId.toString() === userId);
      if (alreadyRegistered) {
        return NextResponse.json({ error: "Already registered" }, { status: 409 });
      }

      // Look up verified handle
      const cpUser = await CPUser.findOne({ userId });
      if (!cpUser || !cpUser.cfHandle) {
        return NextResponse.json({ error: "User must have a Codeforces handle" }, { status: 400 });
      }

      // Push registration
      contest.registrations = [
        ...registrations,
        {
          userId: new mongoose.Types.ObjectId(userId),
          cfHandle: cpUser.cfHandle,
          registeredAt: new Date(),
        },
      ];

      await contest.save();

      // Trigger solved prefetch job in background
      try {
        const { cfSyncQueue } = require("@/lib/bullmq");
        await cfSyncQueue.add("solved_prefetch", { cfHandle: cpUser.cfHandle });
      } catch (queueErr) {
        // Log error but don't fail registration
        console.error("Failed to enqueue solved_prefetch job:", queueErr);
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

      // Check registrations for duplicates
      const registeredUserIds = new Set(registrations.map((reg: any) => reg.userId.toString()));
      for (const memberId of memberIds) {
        if (registeredUserIds.has(memberId)) {
          return NextResponse.json({ error: "Member already registered" }, { status: 409 });
        }
      }

      // Push all members to registration list with team grouping
      const updatedRegs = [...registrations];
      for (const u of cpUsers) {
        updatedRegs.push({
          userId: u.userId,
          cfHandle: u.cfHandle,
          teamName,
          registeredAt: new Date(),
        });
      }
      contest.registrations = updatedRegs;

      await contest.save();

      // Trigger prefetch jobs for all 3 members
      try {
        const { cfSyncQueue } = require("@/lib/bullmq");
        for (const u of cpUsers) {
          await cfSyncQueue.add("solved_prefetch", { cfHandle: u.cfHandle });
        }
      } catch (queueErr) {
        console.error("Failed to enqueue solved_prefetch jobs:", queueErr);
      }

      return NextResponse.json({ registered: true });
    }

    return NextResponse.json({ error: "Unsupported teamSize format" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
