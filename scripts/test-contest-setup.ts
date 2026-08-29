/**
 * Creates a fully provisioned test contest.
 * Run: pnpm test-contest-setup
 *
 * Prerequisites: MongoDB and Redis running, .env.local configured.
 * Cleanup between runs: pnpm clear-contests
 */
import "../src/lib/env";
import { cliEnv } from "../src/lib/env/cli";

import mongoose from "mongoose";
import { createClient, type RedisClientType } from "redis";
import { CURRENT_TENURE } from "../src/lib/constants";

const MONGODB_URI = cliEnv.MONGODB_URI;
const REDIS_URL = cliEnv.REDIS_URL;

type TestRedis = RedisClientType<{}, {}, {}, 3, {}>;

// ── CONFIG ─────────────────────────────────────────────────────────────
// Select which type of contest to create.
//   "1v1-blitz" : classic 2-participant blitz room (dev user + test player)
//   "bracket"   : 4-player knockout bracket (dev user + 3 test players)
const CONTEST_TYPE: "1v1-blitz" | "bracket" = "bracket";

// The dev admin user is always included. Test players are created on demand.
const DEV_USER_EMAIL = "p.rudrajeet@iitg.ac.in";
const TEST_USERS = [
  { name: "Test Player 1", email: "test-player-1@test.com" },
  { name: "Test Player 2", email: "test-player-2@test.com" },
  { name: "Test Player 3", email: "test-player-3@test.com" },
];

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
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: "ContestRound" },
    name: String,
    status: String,
    participants: [mongoose.Schema.Types.ObjectId],
    teams: [mongoose.Schema.Types.ObjectId],
    currentRoundId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContestRound",
    },
    currentProblemIndex: { type: Number, default: 0 },
    actualStartTime: Date,
    bracketPosition: String,
    firstSolvers: {
      type: [
        {
          problemId: String,
          userId: mongoose.Schema.Types.ObjectId,
          solvedAt: Date,
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);
const ContestRoom =
  mongoose.models.ContestRoom ||
  mongoose.model("ContestRoom", ContestRoomSchema, "contest_rooms");

const ContestRoundSchema = new mongoose.Schema(
  {
    contestId: { type: mongoose.Schema.Types.ObjectId, ref: "ContestMatch" },
    roundNumber: Number,
    name: String,
    status: String,
    rooms: [mongoose.Schema.Types.ObjectId],
    bracketLevel: String,
  },
  { timestamps: true },
);
const ContestRound =
  mongoose.models.ContestRound ||
  mongoose.model("ContestRound", ContestRoundSchema, "contest_rounds");

const ContestTeamSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "ContestRoom" },
    roundId: { type: mongoose.Schema.Types.ObjectId, ref: "ContestRound" },
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
  mongoose.model(
    "ContestProblemSet",
    ContestProblemSetSchema,
    "contest_problem_sets",
  );

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

// ── Helpers ─────────────────────────────────────────────────────────────

type TestUser = {
  user: { _id: mongoose.Types.ObjectId; name?: string };
  handle: string;
};

function mockHandle(user: { _id: mongoose.Types.ObjectId; name?: string }) {
  return user.name?.trim() || user._id.toString();
}

async function ensureTestUsers(
  records: { name: string; email: string }[],
): Promise<TestUser[]> {
  const users: TestUser[] = [];
  for (const td of records) {
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
        cfHandle: mockHandle(user),
        cfRating: 3000,
        solvedProblems: [],
      },
      { upsert: true, returnDocument: "after" },
    );

    const handle = mockHandle(user);
    users.push({ user, handle });
    console.log(`✅ User: ${td.name} (${user._id}) handle=${handle}`);
  }
  return users;
}

async function seedProblems() {
  const testProblems = [
    {
      problemId: "1678B1",
      contestId: 1678,
      index: "B1",
      name: "Sort the Array",
      rating: 800,
      tags: ["implementation"],
    },
    {
      problemId: "1678B2",
      contestId: 1678,
      index: "B2",
      name: "Sort the Array II",
      rating: 1000,
      tags: ["implementation"],
    },
    {
      problemId: "1795B1",
      contestId: 1795,
      index: "B1",
      name: "Ideal Point",
      rating: 900,
      tags: ["greedy"],
    },
    {
      problemId: "1800C1",
      contestId: 1800,
      index: "C1",
      name: "Kidnapping",
      rating: 1100,
      tags: ["greedy"],
    },
    {
      problemId: "4A",
      contestId: 4,
      index: "A",
      name: "Watermelon",
      rating: 800,
      tags: ["math"],
    },
    {
      problemId: "158A",
      contestId: 158,
      index: "A",
      name: "Next Round",
      rating: 800,
      tags: ["implementation"],
    },
  ];

  for (const p of testProblems) {
    await ContestQuestion.findOneAndUpdate({ problemId: p.problemId }, p, {
      upsert: true,
    });
  }
  console.log(
    `✅ Seeded ${testProblems.length} problems (including multi-character indices)`,
  );
  return testProblems;
}

async function findDevUser() {
  const devUser = await User.findOne({ email: DEV_USER_EMAIL });
  if (!devUser) {
    console.error(
      "❌ Dev user not found. Run `pnpm seed` first to create your admin account.",
    );
    process.exit(1);
  }
  console.log(`✅ Found dev user: ${devUser.name} (${devUser._id})`);
  return devUser;
}

// Set up a classic 1v1 blitz room: dev user vs. one test player.
async function buildBlitz1v1(
  users: TestUser[],
  devUser: { _id: mongoose.Types.ObjectId; name?: string },
  testProblems: {
    problemId: string;
    contestId: number;
    index: string;
    name: string;
    rating: number;
    tags: string[];
  }[],
  redis: TestRedis,
) {
  const now = new Date();
  // This room is provisioned as active, so its clock must already have begun.
  // The mock CF submission is timestamped at sync time and would otherwise be
  // rejected as preceding a future contest start.
  const startTime = new Date(now.getTime() - 1000);
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
          cfHandle: mockHandle(devUser),
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

  const room = await ContestRoom.findOneAndUpdate(
    { contestId: contest._id },
    {
      contestId: contest._id,
      name: "Test Room",
      status: "active",
      actualStartTime: startTime,
      participants: [...users.map((u) => u.user._id), devUser._id],
      currentProblemIndex: 0,
      firstSolvers: [],
    },
    { upsert: true, returnDocument: "after" },
  );

  const teamPlayers = [
    { user: devUser, handle: mockHandle(devUser) },
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

  room.teams = teams.map((t) => t._id);
  await room.save();

  const roomId = room._id.toString();
  const contestId = contest._id.toString();

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

  await redis.del(`room:${roomId}:teams`);
  await redis.sAdd(
    `room:${roomId}:teams`,
    teams.map((t) => t._id.toString()),
  );

  for (const team of teams) {
    const tId = team._id.toString();
    await redis.hSet(`team:${tId}:meta`, { name: team.name, score: "0" });
    await redis.sAdd(
      `team:${tId}:users`,
      team.members.map((m: mongoose.Types.ObjectId) => m.toString()),
    );
  }

  await redis.sAdd(`contest:${contestId}:rooms`, roomId);

  console.log(`✅ Room: ${room.name} (${roomId})`);
  console.log(
    `✅ Teams: ${teams.map((t) => `${t.name} (${t._id})`).join(", ")}`,
  );
  console.log(
    `✅ Problems: ${selectedProblems.map((p) => p.problemId).join(", ")}`,
  );
  console.log(`✅ Redis state initialized`);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  TEST BATTLE READY (1v1 Blitz)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Contest ID:  ${contestId}`);
  console.log(`  Room ID:     ${roomId}`);
  console.log(`  Team 1:      ${teams[0]._id}  (${devUser.name})`);
  console.log(`  Team 2:      ${teams[1]._id}  (${users[0].handle})`);
  console.log("───────────────────────────────────────────────────────────");
  console.log("  Open: http://localhost:3000/internal/contests");
  console.log(
    "  Room: http://localhost:3000/internal/contests/rooms/" + roomId,
  );
  console.log("═══════════════════════════════════════════════════════════");
}

// Set up a 4-player knockout bracket: dev user + 3 test players.
// Mirrors the end-state produced by generateBracket + activate_bracket:
//   - round 1 (2 waiting matches, teams + Redis initialized)
//   - final round (1 pending match, empty)
//   - contest status active, rounds/rooms/teams persisted, Redis contest meta set
async function buildBracket(
  users: TestUser[],
  devUser: { _id: mongoose.Types.ObjectId; name?: string },
  redis: TestRedis,
) {
  const now = new Date();
  const startTime = new Date(now.getTime() + 10 * 60 * 1000);
  const endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const durationSeconds = 3600;
  const mode = "blitz";
  const teamSize = 1;

  // 4 participants: dev user + 3 test users (in registration order)
  const registrants = [
    {
      user: devUser,
      handle: mockHandle(devUser),
      teamName: devUser.name || "Dev",
    },
    ...users.map((u) => ({
      user: u.user,
      handle: u.handle,
      teamName: u.user.name || u.handle,
    })),
  ];

  const contest = await ContestMatch.findOneAndUpdate(
    { name: "Test Bracket (Setup Script)" },
    {
      name: "Test Bracket (Setup Script)",
      description: "Created by test-contest-setup script (bracket)",
      creatorId: devUser._id,
      startTime,
      endTime,
      durationSeconds,
      format: "bracket",
      mode,
      status: "active",
      teamSize,
      problemSelectionMode: "test",
      registrations: registrants.map((r) => ({
        userId: r.user._id,
        cfHandle: r.handle,
        teamName: r.teamName,
        registeredAt: now,
      })),
      registrationSettings: {
        type: "open",
        deadline: now,
        maxParticipants: 4,
      },
    },
    { upsert: true, returnDocument: "after" },
  );
  console.log(`✅ Bracket contest: ${contest.name} (${contest._id})`);
  const contestId = contest._id.toString();

  // Rounds: round 1 (active) -> final (pending)
  const round1 = await ContestRound.findOneAndUpdate(
    { contestId: contest._id, roundNumber: 1 },
    {
      contestId: contest._id,
      roundNumber: 1,
      name: "Semi-Finals",
      status: "active",
      rooms: [],
      bracketLevel: "round1",
    },
    { upsert: true, returnDocument: "after" },
  );
  const finalRound = await ContestRound.findOneAndUpdate(
    { contestId: contest._id, roundNumber: 2 },
    {
      contestId: contest._id,
      roundNumber: 2,
      name: "Final",
      status: "pending",
      rooms: [],
      bracketLevel: "round2",
    },
    { upsert: true, returnDocument: "after" },
  );

  // Assigned test-mode problems (same pool as generateBracket "test" mode)
  const testPool = [
    { problemId: "4A", name: "Watermelon", rating: 800 },
    { problemId: "1A", name: "Theatre Square", rating: 1000 },
    { problemId: "158A", name: "Next Round", rating: 800 },
  ];

  const allRoomIds: string[] = [];
  const round1RoomIds: mongoose.Types.ObjectId[] = [];

  // Round 1: 2 waiting matches, teams assigned in registration order
  for (let m = 0; m < 2; m++) {
    const left = registrants[m * 2];
    const right = registrants[m * 2 + 1];
    const room = await ContestRoom.findOneAndUpdate(
      { contestId: contest._id, bracketPosition: `0-${m}` },
      {
        contestId: contest._id,
        roundId: round1._id,
        name: `${round1.name} - Match ${m + 1}`,
        status: "waiting",
        participants: [left.user._id, right.user._id],
        teams: [],
        currentRoundId: round1._id,
        currentProblemIndex: 0,
        bracketPosition: `0-${m}`,
        firstSolvers: [],
      },
      { upsert: true, returnDocument: "after" },
    );

    const teams = [];
    for (const reg of [left, right]) {
      const team = await ContestTeam.findOneAndUpdate(
        { roomId: room._id, name: reg.teamName },
        {
          roomId: room._id,
          roundId: round1._id,
          name: reg.teamName,
          members: [reg.user._id],
          teamSize,
          score: 0,
          contestId: contest._id,
        },
        { upsert: true, returnDocument: "after" },
      );
      teams.push(team);
    }
    room.teams = teams.map((t) => t._id);
    await room.save();

    // Problem set + Redis problems for this room
    const assignedProblems = testPool.slice(0, 3);
    await ContestProblemSet.findOneAndUpdate(
      { contestId: contest._id, roomId: room._id },
      {
        contestId: contest._id,
        roomId: room._id,
        problems: assignedProblems.map((p) => ({
          platform: "codeforces",
          problemId: p.problemId,
          name: p.name,
          rating: p.rating,
          points: Math.floor((p.rating || 1000) / 10),
        })),
      },
      { upsert: true },
    );

    const roomId = room._id.toString();
    allRoomIds.push(roomId);
    round1RoomIds.push(room._id);

    // Redis room state (waiting)
    await redis.del(`room:${roomId}:state`);
    await redis.hSet(`room:${roomId}:state`, {
      status: "waiting",
      type: mode,
      startTime: "",
      timeLimit: durationSeconds.toString(),
      readyCount: "0",
      contestId,
    });

    // Redis room problems
    await redis.del(`room:${roomId}:problems`);
    await redis.rPush(
      `room:${roomId}:problems`,
      assignedProblems.map((p) =>
        JSON.stringify({
          problemId: p.problemId,
          name: p.name,
          rating: p.rating,
          points: Math.floor((p.rating || 1000) / 10),
          revealedAt: null,
        }),
      ),
    );

    // Redis room teams + team meta/users
    await redis.del(`room:${roomId}:teams`);
    await redis.sAdd(
      `room:${roomId}:teams`,
      teams.map((t) => t._id.toString()),
    );
    for (const team of teams) {
      const tId = team._id.toString();
      await redis.hSet(`team:${tId}:meta`, { name: team.name, score: "0" });
      await redis.sAdd(
        `team:${tId}:users`,
        team.members.map((member: mongoose.Types.ObjectId) =>
          member.toString(),
        ),
      );
    }

    console.log(
      `✅ Round 1 Match ${m + 1}: ${left.teamName} vs ${right.teamName} (${roomId})`,
    );
  }

  // Final round: 1 pending room with no teams yet
  const finalRoom = await ContestRoom.findOneAndUpdate(
    { contestId: contest._id, bracketPosition: `1-0` },
    {
      contestId: contest._id,
      roundId: finalRound._id,
      name: `${finalRound.name} - Match 1`,
      status: "pending",
      participants: [],
      teams: [],
      currentRoundId: finalRound._id,
      currentProblemIndex: 0,
      bracketPosition: "1-0",
      firstSolvers: [],
    },
    { upsert: true, returnDocument: "after" },
  );
  allRoomIds.push(finalRoom._id.toString());

  round1.rooms = round1RoomIds;
  await round1.save();
  finalRound.rooms = [finalRoom._id];
  await finalRound.save();

  // Redis contest metadata (matches activate_bracket end-state)
  await redis.hSet(`contest:${contestId}:meta`, {
    format: "knockout",
    currentRound: "1",
    status: "active",
  });
  await redis.del(`contest:${contestId}:rooms`);
  await redis.sAdd(`contest:${contestId}:rooms`, allRoomIds);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  BRACKET TOURNAMENT READY (4 players)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Contest ID:  ${contestId}`);
  console.log("  Round 1 (Semi-Finals) waiting matches:");
  for (let m = 0; m < 2; m++) {
    const left = registrants[m * 2];
    const right = registrants[m * 2 + 1];
    console.log(`    Match ${m + 1}: ${left.teamName} vs ${right.teamName}`);
  }
  console.log("  Final: pending (winners advance automatically)");
  console.log("───────────────────────────────────────────────────────────");
  console.log("  Open: http://localhost:3000/internal/contests");
  console.log(
    "  Bracket: http://localhost:3000/internal/contests/" + contestId,
  );
  console.log("  Join round-1 rooms from the bracket viewer (ENTER ROOM).");
  console.log("═══════════════════════════════════════════════════════════");
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const redis = createClient({ url: REDIS_URL });
    await redis.connect();
    console.log("✅ Connected to Redis");

    const needsBracket = CONTEST_TYPE === "bracket";
    const testRecords = needsBracket ? TEST_USERS : TEST_USERS.slice(0, 2);
    const users = await ensureTestUsers(testRecords);

    const testProblems = await seedProblems();
    const devUser = await findDevUser();

    if (needsBracket) {
      await buildBracket(users, devUser, redis);
    } else {
      await buildBlitz1v1(users, devUser, testProblems, redis);
    }

    await mongoose.disconnect();
    await redis.disconnect();
  } catch (error) {
    console.error("❌ Setup error:", error);
    process.exit(1);
  }
}

main();
