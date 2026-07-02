"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import CustomContest from "@/models/CustomContest";
import ContestRoom from "@/models/ContestRoom";
import ContestTeam from "@/models/ContestTeam";
import { getRedis } from "@/lib/redis";
import CPUser from "@/models/CPUser";

export async function createTestContest(formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  await dbConnect();

  const devUser = await User.findById(session.user.id);
  if (!devUser) {
    throw new Error("User not found");
  }

  // Parse Form Data
  const name = formData.get("name") as string || "Test Match";
  const mode = formData.get("mode") as string || "blitz";
  const format = formData.get("format") as string || "1v1";
  const regWaitSeconds = parseInt(formData.get("regWaitSeconds") as string || "15");
  const startWaitSeconds = parseInt(formData.get("startWaitSeconds") as string || "15");
  const durationMinutes = parseInt(formData.get("durationMinutes") as string || "60");
  const numOpponents = parseInt(formData.get("numOpponents") as string || "1");
  const problemsRaw = formData.get("problems") as string || "1900A,1900B,1900C";
  
  const problemsList = problemsRaw.split(",").map(p => p.trim()).filter(p => p.length > 0);
  
  // Make sure we have test users
  const testUsers = [];
  for (let i = 1; i <= numOpponents; i++) {
    const email = `testuser${i}@test.com`;
    const testUser = await User.findOneAndUpdate(
      { email },
      { name: `Test User ${i}`, email, role: "Member" },
      { upsert: true, returnDocument: "after" }
    );
    testUsers.push(testUser);
    
    // Ensure they have a CPUser profile for sync testing
    await CPUser.findOneAndUpdate(
      { userId: testUser._id },
      { cfHandle: `dummy${i}`, cfRating: 1500 },
      { upsert: true }
    );
  }

  // Make sure devUser has a CPUser profile
  await CPUser.findOneAndUpdate(
    { userId: devUser._id },
    { cfHandle: "dummy0", cfRating: 1500 },
    { upsert: true }
  );

  const now = new Date();
  const registrationDeadline = new Date(now.getTime() + regWaitSeconds * 1000);
  const startTime = new Date(registrationDeadline.getTime() + startWaitSeconds * 1000);
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  // 1. Create Contest
  const contest = await CustomContest.create({
    name,
    description: "Generated from Test Scheduler",
    creatorId: devUser._id,
    startTime,
    endTime,
    format,
    mode,
    status: "registration",
    problemSelectionMode: "bulk",
    registrationSettings: {
      type: "open",
      deadline: registrationDeadline,
      maxParticipants: 100,
    },
  });

  // 2. Create Room
  const participants = [devUser._id, ...testUsers.map(u => u._id)];
  const room = await ContestRoom.create({
    contestId: contest._id,
    name: "Test Final #1",
    status: "waiting",
    participants,
    currentProblemIndex: 0
  });

  // 3. Create Teams
  const teamAlpha = await ContestTeam.create({
    contestId: contest._id,
    roomId: room._id,
    name: "Team Alpha",
    members: [devUser._id],
    teamSize: 1,
    score: 0
  });

  // Depending on format, we might put opponents on same or different teams
  const teamIds = [teamAlpha._id];
  const teamsMap: Record<string, string[]> = {
    [teamAlpha._id.toString()]: [devUser._id.toString()]
  };

  if (format === "1v1") {
    // Put testUser1 on teamBeta
    if (testUsers.length > 0) {
      const teamBeta = await ContestTeam.create({
        contestId: contest._id,
        roomId: room._id,
        name: "Team Beta",
        members: [testUsers[0]._id],
        teamSize: 1,
        score: 0
      });
      teamIds.push(teamBeta._id);
      teamsMap[teamBeta._id.toString()] = [testUsers[0]._id.toString()];
    }
  } else {
    // Create separate teams for all
    for (let i = 0; i < testUsers.length; i++) {
      const team = await ContestTeam.create({
        contestId: contest._id,
        roomId: room._id,
        name: `Team Opponent ${i+1}`,
        members: [testUsers[i]._id],
        teamSize: 1,
        score: 0
      });
      teamIds.push(team._id);
      teamsMap[team._id.toString()] = [testUsers[i]._id.toString()];
    }
  }

  room.teams = teamIds;
  await room.save();

  // 4. Populate Redis
  const redis = await getRedis();
  const roomId = room._id.toString();

  // Clear old keys
  const keys = await redis.keys(`room:${roomId}:*`);
  if (keys.length > 0) {
    for (const key of keys) {
      await redis.del(key);
    }
  }

  await redis.sAdd(`room:${roomId}:teams`, teamIds.map(id => id.toString()));
  
  for (const [tId, members] of Object.entries(teamsMap)) {
    await redis.sAdd(`team:${tId}:users`, members);
  }

  await redis.hSet(`room:${roomId}:state`, {
    status: "waiting",
    currentProblem: 0,
    type: mode,
    contestId: contest._id.toString(),
    timeLimit: durationMinutes * 60
  });

  // Problems
  const problemObjects = problemsList.map((pId, idx) => ({
    problemId: pId,
    name: `Test Problem ${idx+1}`,
    rating: 1000 + (idx * 200),
    points: 100 * (idx + 1)
  }));

  for (const p of problemObjects) {
    await redis.rPush(`room:${roomId}:problems`, JSON.stringify(p));
  }

  return { success: true, contestId: contest._id.toString() };
}
