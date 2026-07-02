import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

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
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  cfHandle: { type: String, default: "" },
  cfRating: { type: Number, default: 0 },
}, { strict: false });
const CPUser = mongoose.models.CPUser || mongoose.model("CPUser", CPUserSchema);

const ContestSchema = new mongoose.Schema({
  name: String,
  creatorId: mongoose.Schema.Types.ObjectId,
  startTime: Date,
  endTime: Date,
  format: String,
  mode: String,
  status: String,
  registrations: Array,
  problemSelectionMode: String,
  registrationSettings: Object,
}, { strict: false });
const CustomContest = mongoose.models.CustomContest || mongoose.model("CustomContest", ContestSchema, "custom_contests");

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI!);
    console.log("✅ Connected to MongoDB");

    const redis = createClient({ url: REDIS_URL });
    await redis.connect();
    console.log("✅ Connected to Redis");

    // Seed dev user
    const devUser = await User.findOneAndUpdate(
      { email: "k.sonawane@iitg.ac.in" },
      { name: "Coding Club IITG", email: "k.sonawane@iitg.ac.in", role: "Secretary" },
      { upsert: true, returnDocument: "after" }
    );
    await CPUser.findOneAndUpdate({ userId: devUser._id }, { userId: devUser._id, cfHandle: "dev_cf", cfRating: 1500 }, { upsert: true });

    // Seed 7 other test users
    const testUsers = [];
    for (let i = 1; i <= 7; i++) {
      const user = await User.findOneAndUpdate(
        { email: `testuser${i}@test.com` },
        { name: `Test User ${i}`, email: `testuser${i}@test.com`, role: "Member" },
        { upsert: true, returnDocument: "after" }
      );
      await CPUser.findOneAndUpdate({ userId: user._id }, { userId: user._id, cfHandle: `test_cf_${i}`, cfRating: 1200 }, { upsert: true });
      testUsers.push(user);
    }
    
    const allUsers = [devUser, ...testUsers];
    console.log(`✅ Seeded ${allUsers.length} total users for the bracket tournament`);

    // Create Contest
    const now = new Date();
    const waitSeconds = 15;
    const registrationDeadline = new Date(now.getTime() + waitSeconds * 1000); 
    const startTime = new Date(registrationDeadline.getTime() + 15 * 1000); 
    
    // Register all users except devUser
    const registrations = testUsers.map(u => ({
      userId: u._id,
      cfHandle: `test_cf_${u.email.match(/\d+/)?.[0] || '1'}`,
      registeredAt: new Date()
    }));

    const contest = await CustomContest.create({
      name: "Ultimate Knockout Championship",
      description: "An 8-player elimination bracket tournament",
      creatorId: devUser._id,
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 60 * 60 * 1000), // 1 hour
      format: "bracket",
      mode: "blitz", // Bracket uses blitz rooms
      status: "registration",
      problemSelectionMode: "bulk",
      registrations,
      registrationSettings: {
        type: "open",
        deadline: registrationDeadline,
        maxParticipants: 8,
      },
    });

    console.log(`\n⏳ Knockout Tournament created! Contest ID: ${contest._id}`);
    console.log(`🔗 Go to: /internal/contests and register for the contest!`);
    console.log(`Waiting ${waitSeconds} seconds for registration deadline...`);
    
    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    console.log(`\n⚙️ Registration deadline passed. Waiting 15 seconds until start time...`);
    
    await new Promise(resolve => setTimeout(resolve, 15 * 1000));
    console.log(`\n⚙️ Contest starting! Setting contest to active and generating bracket...`);

    const activeContest = await CustomContest.findById(contest._id);
    activeContest.status = "active";
    await activeContest.save();
    
    try {
      const { generateBracket } = await import("../src/lib/bracket");
      await generateBracket(contest._id.toString());
      console.log(`✅ Bracket successfully generated and stored in Redis`);
    } catch (e) {
      console.error(`❌ Failed to generate bracket:`, e);
    }

    console.log(`\n✨ Bracket Seed completed successfully!`);
    console.log(`🔗 Go to: /internal/contests/${contest._id.toString()}`);
    
    await mongoose.disconnect();
    await redis.disconnect();
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

seed();
