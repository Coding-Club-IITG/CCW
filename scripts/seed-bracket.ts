import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import { createClient } from "redis";

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

const CPUserSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  cfHandle: String,
  cfRating: Number
}, { strict: false });
const CPUser = mongoose.models.CPUser || mongoose.model("CPUser", CPUserSchema, "cp_users");

const ContestSchema = new mongoose.Schema({
  name: String,
  creatorId: mongoose.Schema.Types.ObjectId,
  startTime: Date,
  endTime: Date,
  format: String,
  mode: String,
  status: String,
  teamSize: Number,
  registrations: Array,
  registrationSettings: Object
}, { strict: false });
const CustomContest = mongoose.models.CustomContest || mongoose.model("CustomContest", ContestSchema, "custom_contests");

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
    await CPUser.findOneAndUpdate(
      { userId: devUser._id },
      { userId: devUser._id, cfHandle: "dev_handle", cfRating: 2000 },
      { upsert: true }
    );
    
    const testUsers = [];
    for (let i = 1; i <= 6; i++) {
      const u = await User.findOneAndUpdate(
        { email: `testuser${i}@test.com` },
        { name: `Test User ${i}`, email: `testuser${i}@test.com`, role: "Member" },
        { upsert: true, returnDocument: "after" }
      );
      await CPUser.findOneAndUpdate(
        { userId: u._id },
        { userId: u._id, cfHandle: `test_handle_${i}`, cfRating: 1500 - (i * 100) },
        { upsert: true }
      );
      testUsers.push(u);
    }

    // We now have 7 users in total (devUser + 6 testUsers). 
    // This will force exactly 1 bye (8 slots total)

    const now = new Date();
    const waitSeconds = 5;
    const registrationDeadline = new Date(now.getTime() + waitSeconds * 1000); 
    const startTime = new Date(registrationDeadline.getTime() + 5 * 1000); 

    const registrations = [devUser, ...testUsers].map(u => ({
      userId: u._id,
      cfHandle: u.email === "k.sonawane@iitg.ac.in" ? "dev_handle" : `test_handle_${testUsers.indexOf(u)+1}`,
      teamName: u.name,
      registeredAt: now
    }));

    const contest = await CustomContest.create({
      name: "Grand Knockout Championship",
      description: "A 7-player bracket testing null rooms",
      creatorId: devUser._id,
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 60 * 60 * 1000), // 1 hour
      format: "bracket",
      mode: "arena", // doesn't matter for the bracket generation, but useful
      status: "registration", 
      teamSize: 1,
      problemSelectionMode: "bulk",
      registrationSettings: {
        type: "open",
        deadline: registrationDeadline,
        maxParticipants: 100,
      },
      registrations: registrations
    });

    console.log(`\n⏳ Knockout Tournament created! ID: ${contest._id}`);
    console.log(`Waiting ${waitSeconds} seconds to simulate registration closing...`);
    
    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    
    console.log(`\n⚙️  Worker activated! Registration deadline passed.`);
    console.log(`Generating Bracket...`);
    
    await CustomContest.updateOne({ _id: contest._id }, { $set: { status: "active" } });
    
    const { generateBracket } = await import("../src/lib/bracket");
    const snapshot = await generateBracket(contest._id.toString());

    console.log(`\n🔍 [DEBUG] Backend Bracket Snapshot Generated`);
    console.log(`- Total Rounds: ${snapshot.totalRounds}`);
    console.log(`- Total Nodes: ${snapshot.nodes.length}`);
    console.log(`\n🔍 [DEBUG] Initial Match States (Round 1):`);
    snapshot.nodes.filter((n: any) => n.roundNumber === 1).forEach((node: any) => {
      console.log(`Room: ${node.roomId} | Teams: ${node.teams.join(' vs ')} | Status: ${node.status}`);
    });
    console.log(`\n🔍 [DEBUG] Future Matches (Round 2+):`);
    snapshot.nodes.filter((n: any) => n.roundNumber > 1).forEach((node: any) => {
      console.log(`Round ${node.roundNumber} - Room: ${node.roomId} | Status: ${node.status}`);
    });

    console.log(`\n✨ Bracket Seed completed successfully!`);
    console.log(`🔗 Go to: /internal/contests/${contest._id}`);
    
    await mongoose.disconnect();
    await redis.disconnect();
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

seed();
