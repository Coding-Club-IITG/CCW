/**
 * Creates a fully provisioned test contest with 2 players and a room.
 * Run: pnpm test-contest-setup
 *
 * Prerequisites: MongoDB and Redis running, .env.local configured.
 * Cleanup between runs: pnpm clear-contests
 */
import "../src/lib/env";
import { cliEnv } from "../src/lib/env/cli";

import mongoose from "mongoose";
import { createClient } from "redis";
import { CURRENT_TENURE } from "../src/lib/constants";

const MONGODB_URI = cliEnv.MONGODB_URI;
const REDIS_URL = cliEnv.REDIS_URL;

// ── Minimal schemas (avoids importing the full model tree) ──────────────

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  emailVerified: { type: Boolean, default: false },
  access: String,
  tenure: String,
  managedModules: Array,
  roles: Array,
  codeforces_handle: String,
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

const ContestMatchSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    startTime: Date,
    endTime: Date,
    durationSeconds: Number,
    format: String,
    mode: String,
    status: String,
    teamSize: Number,
    problemSelectionMode: String,
    bulkPlatform: String,
    bulkRatingMin: Number,
    bulkRatingMax: Number,
    bulkProblemCount: Number,
    bulkMinContestId: Number,
    registrations: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        cfHandle: String,
        teamName: String,
        registeredAt: Date,
      },
    ],
    registrationSettings: {
      type: { type: String },
      deadline: Date,
      maxParticipants: Number,
    },
  },
  { timestamps: true },
);
const ContestMatch =
  mongoose.models.ContestMatch ||
  mongoose.model("ContestMatch", ContestMatchSchema, "custom_contests");

const ContestRoomSchema = new mongoose.Schema(
  {
    contestId: { type: mongoose.Schema.Types.ObjectId, ref: "ContestMatch" },
    name: String,
    status: String,
    participants: [mongoose.Schema.Types.ObjectId],
    teams: [mongoose.Schema.Types.ObjectId],
    currentProblemIndex: { type: Number, default: 0 },
    firstSolvers: { type: [{ problemId: String, userId: mongoose.Schema.Types.ObjectId, solvedAt: Date }], default: [] },
  },
  { timestamps: true },
);
const ContestRoom =
  mongoose.models.ContestRoom ||
  mongoose.model("ContestRoom", ContestRoomSchema, "contest_rooms");

const ContestTeamSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ContestRoom" },
    name: String,
    members: [mongoose.Schema.Types.ObjectId],
    teamSize: Number,
    score: { type: Number, default: 0 },
    contestId: { type: mongoose.Schema.Types.ObjectId, ref: "ContestMatch" },
  },
  { timestamps: true },
);
const ContestTeam =
  mongoose.models.ContestTeam ||
  mongoose.model("ContestTeam", ContestTeamSchema, "contest_teams");

const ContestProblemSetSchema = new mongoose.Schema(
  {
    contestId: { type: mongoose.Schema.Types.ObjectId, ref: "ContestMatch" },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ContestRoom" },
    problems: [
      {
        platform: String,
        problemId: String,
        name: String,
        rating: Number,
        points: Number,
      },
    ],
  },
  { timestamps: true },
);
const ContestProblemSet =
  mongoose.models.ContestProblemSet ||
  mongoose.model("ContestProblemSet", ContestProblemSetSchema, "contest_problem_sets");

const ContestQuestionSchema = new mongoose.Schema(
  {
    problemId: { type: String, required: true, unique: true },
    contestId: { type: Number, required: true },
    index: { type: String, required: true },
    name: { type: String, required: true },
    rating: Number,
    tags: [String],
  },
  { timestamps: true },
);
const ContestQuestion =
  mongoose.models.ContestQuestion ||
  mongoose.model("ContestQuestion", ContestQuestionSchema, "cf_questions");

// ── Main ────────────────────────────────────────────────────────────────

async function setup() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const redis = createClient({ url: REDIS_URL });
    await redis.connect();
    console.log("✅ Connected to Redis");

    // ── 1. Ensure 2 test users exist ──────────────────────────────────
    const testUserData = [
      { name: "Test Player 1", email: "test-player-1@test.com", handle: "tourist" },
      { name: "Test Player 2", email: "test-player-2@test.com", handle: "jiangly" },
    ];

    const users = [];
    for (const td of testUserData) {
      const user = await User.findOneAndUpdate(
        { email: td.email },
        {
          name: td.name,
          email: td.email,
          access: "Member",
          tenure: CURRENT_TENURE,
          managedModules: [],
          roles: [],
          emailVerified: true,
        },
        { upsert: true, returnDocument: "after" },
      );

      await CPUser.findOneAndUpdate(
        { userId: user._id },
        {
          userId: user._id,
          cfHandle: td.handle,
          cfRating: 3000,
          solvedProblems: [],
        },
        { upsert: true, returnDocument: "after" },
      );

      users.push({ user, handle: td.handle });
      console.log(`✅ User: ${td.name} (${user._id}) handle=${td.handle}`);
    }

    // ── 2. Ensure some problems exist in cf_questions ─────────────────
    // Include problems with multi-character indices to test link fix
    const testProblems = [
      { problemId: "1678B1", contestId: 1678, index: "B1", name: "Sort the Array", rating: 800, tags: ["implementation"] },
      { problemId: "1678B2", contestId: 1678, index: "B2", name: "Sort the Array II", rating: 1000, tags: ["implementation"] },
      { problemId: "1795B1", contestId: 1795, index: "B1", name: "Ideal Point", rating: 900, tags: ["greedy"] },
      { problemId: "1800C1", contestId: 1800, index: "C1", name: "Kidnapping", rating: 1100, tags: ["greedy"] },
      { problemId: "4A", contestId: 4, index: "A", name: "Watermelon", rating: 800, tags: ["math"] },
      { problemId: "158A", contestId: 158, index: "A", name: "Next Round", rating: 800, tags: ["implementation"] },
    ];

    for (const p of testProblems) {
      await ContestQuestion.findOneAndUpdate(
        { problemId: p.problemId },
        p,
        { upsert: true },
      );
    }
    console.log(`✅ Seeded ${testProblems.length} problems (including multi-character indices)`);

    // ── 3. Find your dev user (seeded by `pnpm seed`) ────────────────
    const devUser = await User.findOne({ email: "codingclub@iitg.ac.in" });
    if (!devUser) {
      console.error(
        "❌ Dev user not found. Run `pnpm seed` first to create your admin account.",
      );
      process.exit(1);
    }
    console.log(`✅ Found dev user: ${devUser.name} (${devUser._id})`);

    // ── 4. Create contest ────────────────────────────────────────────
    const now = new Date();
    const startTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 min from now
    const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const contest = await ContestMatch.findOneAndUpdate(
      { name: "Test Contest (Setup Script)" },
      {
        name: "Test Contest (Setup Script)",
        description: "Created by test-contest-setup script",
        creatorId: users[0].user._id,
        startTime,
        endTime,
        durationSeconds: 7200,
        format: "1v1",
        mode: "blitz",
        status: "active",
        teamSize: 1,
        problemSelectionMode: "test",
        registrations: [
          ...users.map((u) => ({
            userId: u.user._id,
            cfHandle: u.handle,
            registeredAt: now,
          })),
          {
            userId: devUser._id,
            cfHandle: "devuser",
            registeredAt: now,
          },
        ],
        registrationSettings: {
          type: "open",
          deadline: now,
          maxParticipants: 16,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    console.log(`✅ Contest: ${contest.name} (${contest._id})`);

    // ── 4. Create room with teams and problems ───────────────────────
    const room = await ContestRoom.findOneAndUpdate(
      { contestId: contest._id },
      {
        contestId: contest._id,
        name: "Test Room",
        status: "active",
        participants: [...users.map((u) => u.user._id), devUser._id],
        currentProblemIndex: 0,
        firstSolvers: [],
      },
      { upsert: true, returnDocument: "after" },
    );

    // Create teams: dev user + 1 test player
    const teamPlayers = [
      { user: devUser, handle: "devuser" },
      users[0],
    ];
    const teams = [];
    for (let i = 0; i < teamPlayers.length; i++) {
      const team = await ContestTeam.findOneAndUpdate(
        { roomId: room._id, name: `Team ${i + 1}` },
        {
          roomId: room._id,
          name: `Team ${i + 1}`,
          members: [teamPlayers[i].user._id],
          teamSize: 1,
          score: 0,
          contestId: contest._id,
        },
        { upsert: true, returnDocument: "after" },
      );
      teams.push(team);
    }

    // Pick 3 problems from the pool (test mode uses these)
    const selectedProblems = testProblems.slice(0, 3);
    await ContestProblemSet.findOneAndUpdate(
      { contestId: contest._id, roomId: room._id },
      {
        contestId: contest._id,
        roomId: room._id,
        problems: selectedProblems.map((p) => ({
          platform: "codeforces",
          problemId: p.problemId,
          name: p.name,
          rating: p.rating,
          points: Math.floor((p.rating || 1000) / 10),
        })),
      },
      { upsert: true },
    );

    // Link teams to room
    room.teams = teams.map((t) => t._id);
    await room.save();

    // ── 5. Initialize Redis state ────────────────────────────────────
    const roomId = room._id.toString();
    const contestId = contest._id.toString();

    // Room state
    await redis.del(`room:${roomId}:state`);
    await redis.hSet(`room:${roomId}:state`, {
      status: "active",
      type: "blitz",
      startTime: startTime.getTime().toString(),
      timeLimit: "7200",
      contestId,
      readyCount: "0",
      currentProblem: "0",
    });

    // Room problems
    await redis.del(`room:${roomId}:problems`);
    await redis.rPush(
      `room:${roomId}:problems`,
      selectedProblems.map((p) =>
        JSON.stringify({
          problemId: p.problemId,
          name: p.name,
          rating: p.rating,
          points: Math.floor((p.rating || 1000) / 10),
          revealedAt: null,
        }),
      ),
    );

    // Room teams
    await redis.del(`room:${roomId}:teams`);
    await redis.sAdd(
      `room:${roomId}:teams`,
      teams.map((t) => t._id.toString()),
    );

    // Team metadata
    for (const team of teams) {
      const tId = team._id.toString();
      await redis.hSet(`team:${tId}:meta`, { name: team.name, score: "0" });
      await redis.sAdd(
        `team:${tId}:users`,
        team.members.map((m: mongoose.Types.ObjectId) => m.toString()),
      );
    }

    // Contest rooms set
    await redis.sAdd(`contest:${contestId}:rooms`, roomId);

    console.log(`✅ Room: ${room.name} (${roomId})`);
    console.log(`✅ Teams: ${teams.map((t) => `${t.name} (${t._id})`).join(", ")}`);
    console.log(`✅ Problems: ${selectedProblems.map((p) => p.problemId).join(", ")}`);
    console.log(`✅ Redis state initialized`);

    // ── Summary ──────────────────────────────────────────────────────
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  TEST CONTEST READY");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  Contest ID:  ${contestId}`);
    console.log(`  Room ID:     ${roomId}`);
    console.log(`  You:         ${devUser._id} (devuser)`);
    console.log(`  Opponent:    ${users[0].user._id} (${users[0].handle})`);
    console.log(`  Team 1:      ${teams[0]._id}`);
    console.log(`  Team 2:      ${teams[1]._id}`);
    console.log("───────────────────────────────────────────────────────────");
    console.log("  Open: http://localhost:3000/internal/contests");
    console.log("  Room: http://localhost:3000/internal/contests/rooms/" + roomId);
    console.log("───────────────────────────────────────────────────────────");
    console.log("  Test problem links (verify these):");
    for (const p of selectedProblems) {
      console.log(`    ${p.problemId} → https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`);
    }
    console.log("═══════════════════════════════════════════════════════════");

    await mongoose.disconnect();
    await redis.disconnect();
  } catch (error) {
    console.error("❌ Setup error:", error);
    process.exit(1);
  }
}

setup();
