import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;

// Same schemas as in main app
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
});
const User = mongoose.models.User || mongoose.model("User", UserSchema);

const CPUserSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  cfHandle: { type: String, default: "" },
});
const CPUser = mongoose.models.CPUser || mongoose.model("CPUser", CPUserSchema);

const RegistrationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "CPUser", required: true },
  cfHandle: { type: String, required: true },
  teamName: { type: String },
  registeredAt: { type: Date, default: Date.now },
});

const ContestSchema = new mongoose.Schema({
  name: String,
  description: String,
  creatorId: mongoose.Schema.Types.ObjectId,
  startTime: Date,
  endTime: Date,
  durationSeconds: Number,
  format: String,
  mode: String,
  status: String,
  problemSelectionMode: String,
  registrations: [RegistrationSchema],
});
const CustomContest = mongoose.models.CustomContest || mongoose.model("CustomContest", ContestSchema, "custom_contests");

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI!);
    console.log("✅ Connected to MongoDB");

    // Find Kade or fallback to first user
    let user = await User.findOne({ name: /kade/i });
    if (!user) {
      console.log("⚠️ Could not find user with name matching 'kade'. Creating dummy Kade user.");
      user = await User.findOneAndUpdate(
        { email: "kade@test.com" },
        { name: "Kade", email: "kade@test.com" },
        { upsert: true, returnDocument: "after" }
      );
    }
    
    // Ensure CPUser exists for Kade
    let cpUser = await CPUser.findOne({ userId: user._id });
    if (!cpUser) {
      cpUser = await CPUser.create({
        userId: user._id,
        cfHandle: "kade_cf",
      });
    }

    const kadeRegistration = {
      userId: cpUser._id,
      cfHandle: "kade_cf",
      registeredAt: new Date(),
    };

    console.log(`✅ Using CPUser for Kade with ID: ${cpUser._id}`);

    // Clear existing for clean slate (optional, but let's just insert new ones with unique names)
    await CustomContest.deleteMany({ name: /Seeded / });

    const now = new Date();

    const contests = [
      {
        name: "Seeded Weekly Blitz #1",
        description: "A fast-paced 1v1 blitz tournament.",
        creatorId: user._id,
        startTime: new Date(now.getTime() - 1 * 60 * 60 * 1000), // 1 hour ago
        durationSeconds: 2 * 60 * 60, // 2 hours
        format: "1v1",
        mode: "blitz",
        status: "active",
        problemSelectionMode: "bulk",
        registrations: [kadeRegistration], // Kade is registered
      },
      {
        name: "Seeded Monthly Arena",
        description: "Compete against everyone in the arena.",
        creatorId: user._id,
        startTime: new Date(now.getTime() + 48 * 60 * 60 * 1000), // in 2 days
        durationSeconds: 3 * 60 * 60, // 3 hours
        format: "solo-tournament",
        mode: "arena",
        status: "registration",
        problemSelectionMode: "bulk",
        registrations: [], // Kade is NOT registered
      },
      {
        name: "Seeded Knockout Bracket",
        description: "Single elimination bracket.",
        creatorId: user._id,
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000), // in 1 day
        durationSeconds: 5 * 60 * 60, // 5 hours
        format: "bracket",
        mode: "arena",
        status: "registration",
        problemSelectionMode: "bulk",
        registrations: [kadeRegistration], // Kade is registered
      },
      {
        name: "Seeded Past Blitz",
        description: "Completed blitz match.",
        creatorId: user._id,
        startTime: new Date(now.getTime() - 72 * 60 * 60 * 1000), // 3 days ago
        durationSeconds: 1 * 60 * 60, // 1 hour
        format: "1v1",
        mode: "blitz",
        status: "completed",
        problemSelectionMode: "bulk",
        registrations: [kadeRegistration],
      }
    ];

    for (const data of contests) {
      await CustomContest.create(data);
      console.log(`✅ Created contest: ${data.name}`);
    }

    console.log("✨ Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();
