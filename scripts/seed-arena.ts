import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";
import { createClient } from "redis";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  emailVerified: { type: Boolean, default: false },
  role: String,
  codeforces_handle: String,
}, { strict: false });
const User = mongoose.models.User || mongoose.model("User", UserSchema);

const ContestSchema = new mongoose.Schema({
  name: String,
  creatorId: mongoose.Schema.Types.ObjectId,
  startTime: Date,
  endTime: Date,
  format: String,
  mode: String,
  status: String,
}, { strict: false });
const CustomContest = mongoose.models.CustomContest || mongoose.model("CustomContest", ContestSchema, "custom_contests");

const ContestRoomSchema = new mongoose.Schema({
  contestId: mongoose.Schema.Types.ObjectId,
  name: String,
  status: String,
  participants: [mongoose.Schema.Types.ObjectId],
  teams: [mongoose.Schema.Types.ObjectId],
  currentProblemIndex: Number,
}, { strict: false });
const ContestRoom = mongoose.models.ContestRoom || mongoose.model("ContestRoom", ContestRoomSchema, "contest_rooms");

const ContestTeamSchema = new mongoose.Schema({
  contestId: mongoose.Schema.Types.ObjectId,
  roomId: mongoose.Schema.Types.ObjectId,
  name: String,
  members: [mongoose.Schema.Types.ObjectId],
  score: Number,
}, { strict: false });
const ContestTeam = mongoose.models.ContestTeam || mongoose.model("ContestTeam", ContestTeamSchema, "contest_teams");

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI!);
    console.log("✅ Connected to MongoDB");

    const redis = createClient({ url: REDIS_URL });
    await redis.connect();
    console.log("✅ Connected to Redis");

    // Upsert users
    const devUser = await User.findOneAndUpdate(
      { email: "k.sonawane@iitg.ac.in" },
      { name: "Coding Club IITG", email: "k.sonawane@iitg.ac.in", role: "Secretary" },
      { upsert: true, returnDocument: "after" }
    );
    
    const testUser1 = await User.findOneAndUpdate(
      { email: "testuser1@test.com" },
      { name: "Test User 1", email: "testuser1@test.com", role: "Member" },
      { upsert: true, returnDocument: "after" }
    );
    
    const testUser2 = await User.findOneAndUpdate(
      { email: "testuser2@test.com" },
      { name: "Test User 2", email: "testuser2@test.com", role: "Member" },
      { upsert: true, returnDocument: "after" }
    );

    const testUser3 = await User.findOneAndUpdate(
      { email: "testuser3@test.com" },
      { name: "Test User 3", email: "testuser3@test.com", role: "Member" },
      { upsert: true, returnDocument: "after" }
    );

    // Create Contest
    const now = new Date();
    const waitSeconds = 15;
    const registrationDeadline = new Date(now.getTime() + waitSeconds * 1000); 
    const startTime = new Date(registrationDeadline.getTime() + 15 * 1000); 
    const contest = await CustomContest.create({
      name: "Grand Arena Clash",
      description: "An interactive Arena format match",
      creatorId: devUser._id,
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 1 * 60 * 1000), // 1 minute
      format: "free-for-all",
      mode: "arena",
      status: "registration",
      problemSelectionMode: "bulk",
      registrationSettings: {
        type: "open",
        deadline: registrationDeadline,
        maxParticipants: 100,
      },
    });

    // Create Room
    const room = await ContestRoom.create({
      contestId: contest._id,
      name: "Arena Final #1",
      status: "waiting",
      participants: [devUser._id, testUser1._id, testUser2._id, testUser3._id],
      currentProblemIndex: 0
    });

    // Create Teams
    const teamAlpha = await ContestTeam.create({
      contestId: contest._id,
      roomId: room._id,
      name: "Team Alpha",
      members: [devUser._id],
      score: 0
    });

    const teamBeta = await ContestTeam.create({
      contestId: contest._id,
      roomId: room._id,
      name: "Team Beta",
      members: [testUser1._id],
      score: 0
    });

    const teamGamma = await ContestTeam.create({
      contestId: contest._id,
      roomId: room._id,
      name: "Team Gamma",
      members: [testUser2._id, testUser3._id],
      score: 0
    });

    room.teams = [teamAlpha._id, teamBeta._id, teamGamma._id];
    await room.save();

    const roomId = room._id.toString();

    // Clean old redis state
    const keys = await redis.keys(`room:${roomId}:*`);
    if (keys.length > 0) {
      await redis.del(keys);
    }

    // Populate Redis
    await redis.sAdd(`room:${roomId}:teams`, [teamAlpha._id.toString(), teamBeta._id.toString(), teamGamma._id.toString()]);
    await redis.sAdd(`team:${teamAlpha._id.toString()}:users`, [devUser._id.toString()]);
    await redis.sAdd(`team:${teamBeta._id.toString()}:users`, [testUser1._id.toString()]);
    await redis.sAdd(`team:${teamGamma._id.toString()}:users`, [testUser2._id.toString(), testUser3._id.toString()]);

    await redis.hSet(`room:${roomId}:state`, {
      status: "waiting",
      type: "arena",
      contestId: contest._id.toString(),
      timeLimit: 60 // 1 minute
    });

    console.log(`\n⏳ Contest created! Waiting ${waitSeconds} seconds to simulate background worker...`);
    
    // Simulate Worker Wait
    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    console.log(`\n⚙️  Worker activated! Registration deadline passed. Generating problems and activating rooms...`);
    
    await CustomContest.updateOne({ _id: contest._id }, { $set: { status: "active" } });
    await ContestRoom.updateOne({ _id: room._id }, { $set: { status: "active" } });

    // Problems
    const problems = [
      { problemId: "2236A", name: "Games on the Train", rating: 800, points: 100 }
    ];

    for (const p of problems) {
      await redis.rPush(`room:${roomId}:problems`, JSON.stringify(p));
    }

    console.log(`\n🤖 The room is open! Waiting for you (Dev User) to press 'I AM READY' in the UI...`);
    
    let devReady = false;
    while (!devReady) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const isMember = await redis.sIsMember(`room:${roomId}:ready_users`, devUser._id.toString());
      devReady = isMember === 1;
    }

    console.log(`\n✅ You are ready! Waiting 5 seconds to simulate other users getting ready...`);
    await new Promise(resolve => setTimeout(resolve, 5000)); 
    
    const res1 = await fetch(`http://localhost:3000/api/contests/rooms/${roomId}/ready`, { method: "POST", headers: { "x-test-user-id": testUser1._id.toString() } });
    const res2 = await fetch(`http://localhost:3000/api/contests/rooms/${roomId}/ready`, { method: "POST", headers: { "x-test-user-id": testUser2._id.toString() } });
    const res3 = await fetch(`http://localhost:3000/api/contests/rooms/${roomId}/ready`, { method: "POST", headers: { "x-test-user-id": testUser3._id.toString() } });

    if (res1.ok && res2.ok && res3.ok) {
      console.log(`✅ All users are now ready! The match should start instantly in your UI.`);
    } else {
      console.error(`❌ Failed to ready some test users`);
    }

    console.log(`\n✨ Arena Seed completed successfully!`);
    console.log(`🔗 Go to: /internal/contests/rooms/${roomId}`);
    
    await mongoose.disconnect();
    await redis.disconnect();
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

seed();
