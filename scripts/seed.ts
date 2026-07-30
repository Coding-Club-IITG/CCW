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
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
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

const ContestMatch =
  mongoose.models.ContestMatch ||
  mongoose.model("ContestMatch", ContestSchema, "custom_contests");

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI!);
    console.log("✅ Connected to MongoDB");

    // Seed main dev user
    const devUser = {
      name: "Coding Club IITG",
      email: "codingclub@iitg.ac.in",
      role: "Secretary",
      moduleRoles: [],
      emailVerified: true,
    };
    const createdDevUser = await User.findOneAndUpdate(
      { email: devUser.email },
      devUser,
      {
        upsert: true,
        returnDocument: "after",
      },
    );
    console.log("✅ Seeded dev user:", devUser.email);

    // Seed 6 test users
    const testUsers = [
      {
        name: "Test User 1",
        email: "testuser1@test.com",
        codeforces_handle: "testhandle1",
      },
      {
        name: "Test User 2",
        email: "testuser2@test.com",
        codeforces_handle: "testhandle2",
      },
      {
        name: "Test User 3",
        email: "testuser3@test.com",
        codeforces_handle: "testhandle3",
      },
      {
        name: "Test User 4",
        email: "testuser4@test.com",
        codeforces_handle: "testhandle4",
      },
      {
        name: "Test User 5",
        email: "testuser5@test.com",
        codeforces_handle: "testhandle5",
      },
      {
        name: "Test User 6",
        email: "testuser6@test.com",
        codeforces_handle: "testhandle6",
      },
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
        { upsert: true, returnDocument: "after" },
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
        { upsert: true, returnDocument: "after" },
      );

      console.log(`✅ Seeded test user:`, testUser.email);
    }

    // Create a sample custom contest with all required fields
    const now = new Date();
    const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

    const sampleContest = {
      name: "Test Contest 1",
      creatorId: createdDevUser._id,
      startTime: now,
      endTime: endTime,
      durationSeconds: 2 * 60 * 60, // 2 hours
      format: "1v1",
      mode: "blitz",
      status: "draft",
      problemSelectionMode: "bulk",
      bulkPlatform: "codeforces",
      bulkRatingMin: 800,
      bulkRatingMax: 1200,
      bulkProblemCount: 3,
    };

    const createdContest = await ContestMatch.findOneAndUpdate(
      { name: sampleContest.name },
      sampleContest,
      { upsert: true, returnDocument: "after" },
    );
    console.log(
      "✅ Seeded sample custom contest:",
      createdContest._id.toString(),
    );

    console.log("\n✨ Seed completed successfully!");
    console.log("\nTest User IDs (use these in your tests):");
    createdTestUsers.forEach((user, i) => {
      console.log(`  User ${i + 1} (${user.email}): ${user._id.toString()}`);
    });
    console.log(`\nSample Contest ID: ${createdContest._id.toString()}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

seed();
