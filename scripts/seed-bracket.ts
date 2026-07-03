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

const ContestRoomSchema = new mongoose.Schema({
  contestId: mongoose.Schema.Types.ObjectId,
  name: String,
  status: String,
  participants: Array,
  teams: [mongoose.Schema.Types.ObjectId],
  currentRoundId: mongoose.Schema.Types.ObjectId,
  currentProblemIndex: Number,
  firstSolvers: Array,
  bracketPosition: String,
}, { strict: false });
const ContestRoom = mongoose.models.ContestRoom || mongoose.model("ContestRoom", ContestRoomSchema, "contest_rooms");

const ContestTeamSchema = new mongoose.Schema({
  roomId: mongoose.Schema.Types.ObjectId,
  name: String,
  members: [mongoose.Schema.Types.ObjectId],
  teamSize: Number,
  score: Number,
  contestId: mongoose.Schema.Types.ObjectId,
  roundId: mongoose.Schema.Types.ObjectId,
}, { strict: false });
const ContestTeam = mongoose.models.ContestTeam || mongoose.model("ContestTeam", ContestTeamSchema, "contest_teams");

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI!);
    console.log("✅ Connected to MongoDB");

    const redis = createClient({ url: REDIS_URL });
    await redis.connect();
    console.log("✅ Connected to Redis");

    // Upsert users with realistic handles
    const handles = ["AlexChen", "SarahJ", "DavidP", "MayaK", "RahulK", "JaneL", "TomC", "ronits2407"];
    const ratings = [2100, 1900, 1800, 1750, 2000, 1650, 1500, 1850];

    const devUser = await User.findOneAndUpdate(
      { email: "k.sonawane@iitg.ac.in" },
      { name: "Coding Club IITG", email: "k.sonawane@iitg.ac.in", role: "Secretary" },
      { upsert: true, returnDocument: "after" }
    );
    await CPUser.findOneAndUpdate(
      { userId: devUser._id },
      { userId: devUser._id, cfHandle: handles[0], cfRating: ratings[0] },
      { upsert: true }
    );

    const allUsers = [devUser];
    for (let i = 1; i < 8; i++) {
      const u = await User.findOneAndUpdate(
        { email: `testuser${i}@test.com` },
        { name: `Test User ${i}`, email: `testuser${i}@test.com`, role: "Member" },
        { upsert: true, returnDocument: "after" }
      );
      await CPUser.findOneAndUpdate(
        { userId: u._id },
        { userId: u._id, cfHandle: handles[i], cfRating: ratings[i] },
        { upsert: true }
      );
      allUsers.push(u);
    }

    console.log(`\n👥 Created ${allUsers.length} users: ${handles.join(', ')}`);

    const now = new Date();
    const waitSeconds = 5;
    const registrationDeadline = new Date(now.getTime() + waitSeconds * 1000);
    const startTime = new Date(registrationDeadline.getTime());
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    const registrations = allUsers.map((u, i) => ({
      userId: u._id,
      cfHandle: handles[i],
      teamName: handles[i],
      registeredAt: new Date(now.getTime() - 1000)
    }));

    const contest = await CustomContest.create({
      name: "Winter Code Fest '26",
      description: "An 8-player bracket with mixed match states",
      creatorId: devUser._id,
      startTime,
      endTime,
      format: "bracket",
      mode: "arena",
      status: "registration", // Registration phase
      teamSize: 1,
      problemSelectionMode: "bulk",
      registrationSettings: {
        type: "open",
        deadline: registrationDeadline,
        maxParticipants: 100,
      },
      registrations,
    });

    console.log(`\n🏆 Contest created: ${contest._id}`);
    console.log(`⏳ Waiting ${waitSeconds} seconds to simulate registration period...`);
    
    // Simulate Worker Wait (Wait for registration to close)
    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    console.log(`\n⚙️  Worker activated! Registration deadline passed. Starting contest and generating bracket...`);

    // Worker logic: update contest status to active
    await CustomContest.updateOne({ _id: contest._id }, { $set: { status: "active" } });

    // Generate bracket manually for full control over states
    const { generateBracket, getBracketSnapshot } = await import("../src/lib/bracket");
    const snapshot = await generateBracket(contest._id.toString());

    // Now manually update rooms to create mixed states:
    // Round 1 has 4 matches → make Match 1 = COMPLETED (AlexChen wins), Match 2 = ACTIVE (live), Match 3 = COMPLETED, Match 4 = UPCOMING
    const round1Rooms = await ContestRoom.find({
      contestId: contest._id,
      bracketPosition: { $regex: /^0-/ }
    }).sort({ bracketPosition: 1 });

    console.log(`📦 Round 1 rooms: ${round1Rooms.length}`);

    // Match 1 (0-0): COMPLETED — team 0 wins with 300, team 1 has 150
    if (round1Rooms[0]) {
      const room = round1Rooms[0];
      const teams = await ContestTeam.find({ _id: { $in: room.teams } });
      if (teams.length >= 2) {
        await ContestTeam.findByIdAndUpdate(teams[0]._id, { score: 300 });
        await ContestTeam.findByIdAndUpdate(teams[1]._id, { score: 150 });
        await ContestRoom.findByIdAndUpdate(room._id, { status: "ended" });
        console.log(`  ✅ Match 1: ${teams[0].name} (300) beats ${teams[1].name} (150) — COMPLETED`);
      }
    }

    // Match 2 (0-1): ACTIVE — both teams have live scores
    if (round1Rooms[1]) {
      const room = round1Rooms[1];
      const teams = await ContestTeam.find({ _id: { $in: room.teams } });
      if (teams.length >= 2) {
        await ContestTeam.findByIdAndUpdate(teams[0]._id, { score: 120 });
        await ContestTeam.findByIdAndUpdate(teams[1]._id, { score: 95 });
        await ContestRoom.findByIdAndUpdate(room._id, { status: "active" });
        console.log(`  🔴 Match 2: ${teams[0].name} (120) vs ${teams[1].name} (95) — ACTIVE/LIVE`);
      }
    }

    // Match 3 (0-2): COMPLETED — team wins with 450 vs 400
    if (round1Rooms[2]) {
      const room = round1Rooms[2];
      const teams = await ContestTeam.find({ _id: { $in: room.teams } });
      if (teams.length >= 2) {
        await ContestTeam.findByIdAndUpdate(teams[0]._id, { score: 450 });
        await ContestTeam.findByIdAndUpdate(teams[1]._id, { score: 400 });
        await ContestRoom.findByIdAndUpdate(room._id, { status: "ended" });
        console.log(`  ✅ Match 3: ${teams[0].name} (450) beats ${teams[1].name} (400) — COMPLETED`);
      }
    }

    // Match 4 (0-3): WAITING (upcoming) — no scores yet
    if (round1Rooms[3]) {
      const room = round1Rooms[3];
      const teams = await ContestTeam.find({ _id: { $in: room.teams } });
      if (teams.length >= 2) {
        console.log(`  ⏳ Match 4: ${teams[0].name} vs ${teams[1].name} — UPCOMING`);
      }
    }

    // Get and advance winners for completed matches into semis
    // Match 1 winner → Semi 1
    if (round1Rooms[0]) {
      const teams = await ContestTeam.find({ _id: { $in: round1Rooms[0].teams } });
      if (teams[0]) {
        const { advanceWinner } = await import("../src/lib/bracket");
        await advanceWinner(round1Rooms[0]._id.toString(), contest._id.toString(), teams[0]._id.toString());
        console.log(`  ➡️  Advanced ${teams[0].name} to Semi-Final 1`);
      }
    }

    // Match 3 winner → Semi 2
    if (round1Rooms[2]) {
      const teams = await ContestTeam.find({ _id: { $in: round1Rooms[2].teams } });
      if (teams[0]) {
        const { advanceWinner } = await import("../src/lib/bracket");
        await advanceWinner(round1Rooms[2]._id.toString(), contest._id.toString(), teams[0]._id.toString());
        console.log(`  ➡️  Advanced ${teams[0].name} to Semi-Final 2`);
      }
    }

    // Make Semi-Final 1 ACTIVE (it has AlexChen advanced + waiting for Match 2 winner)
    const semi1Rooms = await ContestRoom.find({
      contestId: contest._id,
      bracketPosition: "1-0"
    });
    if (semi1Rooms[0]) {
      const semiTeams = await ContestTeam.find({ _id: { $in: semi1Rooms[0].teams } });
      if (semiTeams.length >= 1) {
        await ContestTeam.findByIdAndUpdate(semiTeams[0]._id, { score: 210 });
      }
      console.log(`  🔴 Semi-Final 1: ${semiTeams[0]?.name || 'TBD'} (210) vs TBD — ACTIVE`);
    }

    // Refresh the snapshot and publish
    const finalSnapshot = await getBracketSnapshot(contest._id.toString());

    console.log(`\n🔍 [DEBUG] Final Bracket Snapshot:`);
    console.log(`  Total Rounds: ${finalSnapshot.totalRounds}`);
    console.log(`  Total Nodes: ${finalSnapshot.nodes.length}`);
    console.log(`  Current Round: ${finalSnapshot.currentRound}`);
    console.log(`\n🔍 [DEBUG] All Match States:`);
    finalSnapshot.nodes.forEach((node: any) => {
      const t1 = node.teamNames?.[0] || 'TBD';
      const t2 = node.teamNames?.[1] || 'TBD';
      console.log(`  Round ${node.roundNumber} Match ${node.matchIndex + 1}: ${t1} (${node.scores[0]}) vs ${t2} (${node.scores[1]}) | Status: ${node.status} | Winner: ${node.winner || 'none'}`);
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
