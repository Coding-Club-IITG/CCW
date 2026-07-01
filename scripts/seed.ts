import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  emailVerified: { type: Boolean, default: false },
  role: String,
  moduleRoles: Array,
  codeforces_handle: String,
  atcoder_handle: String,
  pizza_count: { type: Number, default: 0 },
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);

const CPUserSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  cfHandle: { type: String, default: "" },
  cfRating: { type: Number, default: 0 },
  acHandle: { type: String, default: "" },
  solvedProblems: [{ problemId: String, rating: Number, solvedAt: Date }],
});

const CPUser = mongoose.models.CPUser || mongoose.model("CPUser", CPUserSchema);

// Use a minimal contest schema for seed data - just create enough for API to find
const ContestSchema = new mongoose.Schema({
  name: String,
  creatorId: mongoose.Schema.Types.ObjectId,
  startTime: Date,
  endTime: Date,
  durationSeconds: Number,
  format: String,
  mode: String,
  status: String,
  problemSelectionMode: String,
  bulkPlatform: String,
  bulkRatingMin: Number,
  bulkRatingMax: Number,
  bulkProblemCount: Number,
});

const CustomContest = mongoose.models.CustomContest || 
  mongoose.model("CustomContest", ContestSchema, "custom_contests");

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI!);
    console.log("✅ Connected to MongoDB");

    // Seed main dev user
    const devUser = {
      name: "Coding Club IITG",
      email: "k.sonawane@iitg.ac.in",
      role: "Secretary",
      moduleRoles: [],
      emailVerified: true,
    };
    const createdDevUser = await User.findOneAndUpdate({ email: devUser.email }, devUser, {
      upsert: true,
      returnDocument: "after",
    });
    console.log("✅ Seeded dev user:", devUser.email);

    // Seed 6 test users
    const testUsers = [
      { name: "Test User 1", email: "testuser1@test.com", codeforces_handle: "testhandle1" },
      { name: "Test User 2", email: "testuser2@test.com", codeforces_handle: "testhandle2" },
      { name: "Test User 3", email: "testuser3@test.com", codeforces_handle: "testhandle3" },
      { name: "Test User 4", email: "testuser4@test.com", codeforces_handle: "testhandle4" },
      { name: "Test User 5", email: "testuser5@test.com", codeforces_handle: "testhandle5" },
      { name: "Test User 6", email: "testuser6@test.com", codeforces_handle: "testhandle6" },
    ];

    const createdTestUsers = [];
    for (const testUser of testUsers) {
      const created = await User.findOneAndUpdate(
        { email: testUser.email },
        {
          ...testUser,
          role: "Member",
          moduleRoles: [],
          emailVerified: true,
        },
        { upsert: true, returnDocument: "after" }
      );
      createdTestUsers.push(created);
      
      // Create corresponding CPUser document
      await CPUser.findOneAndUpdate(
        { userId: created._id },
        {
          userId: created._id,
          cfHandle: testUser.codeforces_handle,
          cfRating: 1200,
          solvedProblems: [],
        },
        { upsert: true, returnDocument: "after" }
      );
      
      console.log(`✅ Seeded test user:`, testUser.email);
    }

    // Clear existing custom contests
    await CustomContest.deleteMany({});
    console.log("✅ Cleared existing custom contests");

    const now = new Date();
    
    const dummyContests = [
      // Active Contests
      { name: "Weekend CodeSprint #42", description: "Div 1 & Div 2 Rated", format: "solo-tournament", mode: "arena", status: "active", offsetStart: -1, offsetEnd: 1, duration: 2 },
      { name: "Global Algorithm Arena", description: "All Divisions", format: "solo-tournament", mode: "arena", status: "active", offsetStart: -0.5, offsetEnd: 2.5, duration: 3 },
      { name: "Speed Coding Series: Trees", description: "Fast-paced 1v1 on Trees", format: "1v1", mode: "blitz", status: "active", offsetStart: -0.2, offsetEnd: 0.8, duration: 1 },
      { name: "Monthly Knockout Phase 1", description: "Bracket tournament matches ongoing", format: "bracket", mode: "arena", status: "active", offsetStart: -10, offsetEnd: 10, duration: 24 },
      
      // Upcoming (registration)
      { name: "Algorithmic Blitz: Graphs", description: "Graph theory strictly.", format: "1v1", mode: "blitz", status: "registration", offsetStart: 24, offsetEnd: 25, duration: 1 },
      { name: "Dynamic Programming Dash", description: "1v1 on DP", format: "1v1", mode: "blitz", status: "registration", offsetStart: 48, offsetEnd: 49, duration: 1 },
      { name: "Freshman Welcome Arena", description: "For first years", format: "solo-tournament", mode: "arena", status: "registration", offsetStart: 72, offsetEnd: 74, duration: 2 },
      { name: "IITG Master Championship", description: "The premier tournament.", format: "bracket", mode: "arena", status: "registration", offsetStart: 120, offsetEnd: 144, duration: 24 },
      
      // Completed (past)
      { name: "CodeSprint #41", description: "Div 1 & Div 2 Rated", format: "solo-tournament", mode: "arena", status: "completed", offsetStart: -48, offsetEnd: -46, duration: 2 },
      { name: "CodeSprint #40", description: "Div 2 Rated", format: "solo-tournament", mode: "arena", status: "completed", offsetStart: -200, offsetEnd: -198, duration: 2 },
      { name: "Blitz Series #5", description: "Math & Number Theory", format: "1v1", mode: "blitz", status: "completed", offsetStart: -100, offsetEnd: -99, duration: 1 },
      { name: "Blitz Series #4", description: "Greedy Algorithms", format: "1v1", mode: "blitz", status: "completed", offsetStart: -150, offsetEnd: -149, duration: 1 },
      { name: "Spring Knockout 2026", description: "The spring classic tournament", format: "bracket", mode: "arena", status: "completed", offsetStart: -500, offsetEnd: -450, duration: 24 },
    ];

    for (const data of dummyContests) {
      await CustomContest.create({
        name: data.name,
        description: data.description,
        creatorId: createdDevUser._id,
        startTime: new Date(now.getTime() + data.offsetStart * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + data.offsetEnd * 60 * 60 * 1000),
        durationSeconds: data.duration * 60 * 60,
        format: data.format,
        mode: data.mode,
        status: data.status,
        problemSelectionMode: "bulk",
        registrations: Array.from({ length: Math.floor(Math.random() * 500) }).map((_, i) => ({
          userId: createdDevUser._id,
          cfHandle: `dummy${i}`,
          registeredAt: now,
        })),
      });
    }

    console.log(`✅ Seeded ${dummyContests.length} custom contests of various combinations`);

    console.log("\n✨ Seed completed successfully!");
    console.log("\nTest User IDs (use these in your tests):");
    createdTestUsers.forEach((user, i) => {
      console.log(`  User ${i + 1} (${user.email}): ${user._id.toString()}`);
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

seed();
