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
  registrationSettings: Object,
  registrations: Array,
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

    // Clear existing data (keep dev user)
    await User.deleteMany({ email: { $ne: devUser.email } });
    await CPUser.deleteMany({ userId: { $ne: createdDevUser._id } });
    await CustomContest.deleteMany({});
    
    // Attempt to clear rooms and teams if they exist
    const ContestRoom = mongoose.models.ContestRoom || mongoose.model("ContestRoom", new mongoose.Schema({}), "contest_rooms");
    const ContestTeam = mongoose.models.ContestTeam || mongoose.model("ContestTeam", new mongoose.Schema({}), "contest_teams");
    await ContestRoom.deleteMany({});
    await ContestTeam.deleteMany({});
    
    console.log("✅ Cleared existing data (kept dev user)");

    const now = new Date();
    
    const dummyContests = [
      // --- ACTIVE CONTESTS ---
      // Started recently
      { name: "Global Algorithm Arena", description: "Currently running contest.", format: "solo-tournament", mode: "arena", status: "active", offsetMinutesStart: -5, offsetMinutesEnd: 55, duration: 1, deadlineMinutes: 5 },
      
      // --- UPCOMING CONTESTS ---
      // Starts in 3 minutes -> Registration still OPEN (deadline is 1 min before start, i.e., in 2 mins)
      { name: "Upcoming - Open", description: "Registration closes in 2 mins.", format: "solo-tournament", mode: "arena", status: "registration", offsetMinutesStart: 3, offsetMinutesEnd: 63, duration: 1, deadlineMinutes: 1 },
      
      // Starts in 1 minute -> Registration CLOSED (deadline was 2 mins before start, i.e., passed 1 min ago)
      { name: "Upcoming - Closed", description: "Registration closed. Starts in 1 min!", format: "1v1", mode: "blitz", status: "registration", offsetMinutesStart: 1, offsetMinutesEnd: 61, duration: 1, deadlineMinutes: 2 },
      
      // Starts in 2 minutes -> Registration CLOSED (deadline was 3 mins before start, passed 1 min ago)
      { name: "Upcoming - Closed 2", description: "Starts in 2 minutes.", format: "1v1", mode: "blitz", status: "registration", offsetMinutesStart: 2, offsetMinutesEnd: 62, duration: 1, deadlineMinutes: 3 },

      // --- COMPLETED CONTESTS ---
      // Early Finish: started 30 mins ago, mathematically has 30 mins left, but explicitly completed in DB
      { name: "Sudden Death Arena (Early Finish)", description: "Ended prematurely by admin.", format: "1v1", mode: "arena", status: "completed", offsetMinutesStart: -30, offsetMinutesEnd: 30, duration: 1, deadlineMinutes: 5 },
    ];

    for (const data of dummyContests) {
      const startTime = new Date(now.getTime() + data.offsetMinutesStart * 60 * 1000);
      const endTime = new Date(now.getTime() + data.offsetMinutesEnd * 60 * 1000);
      await CustomContest.create({
        name: data.name,
        description: data.description,
        creatorId: createdDevUser._id,
        startTime: startTime,
        endTime: endTime,
        durationSeconds: data.duration * 60 * 60,
        format: data.format,
        mode: data.mode,
        status: data.status,
        problemSelectionMode: "bulk",
        registrationSettings: {
          type: "open",
          deadline: new Date(startTime.getTime() - 1000 * 60 * data.deadlineMinutes),
          maxParticipants: 100,
        },
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
