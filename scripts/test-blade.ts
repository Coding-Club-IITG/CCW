import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";
import crypto from "crypto";
import readline from "readline";
import { EventSource } from "eventsource";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.models.User || mongoose.model("User", UserSchema);
const CPUserSchema = new mongoose.Schema({}, { strict: false });
const CPUser = mongoose.models.CPUser || mongoose.model("CPUser", CPUserSchema);
const ContestSchema = new mongoose.Schema({}, { strict: false });
const CustomContest = mongoose.models.CustomContest || mongoose.model("CustomContest", ContestSchema, "custom_contests");
const ContestRoomSchema = new mongoose.Schema({}, { strict: false });
const ContestRoom = mongoose.models.ContestRoom || mongoose.model("ContestRoom", ContestRoomSchema, "contest_rooms");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query: string): Promise<string> => new Promise(resolve => rl.question(query, resolve));

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------
// SSE BOT CLIENT
// ---------------------------------------------------------
async function runBotClient(botUser: any, roomId: string, contestId: string, teamId: string | null, mode: string, targetProblemIds?: string[]) {
  const headers = { 
    "x-test-user-id": botUser._id.toString(),
    "Content-Type": "application/json"
  };
  
  const es = new EventSource(`${BASE_URL}/api/events?roomId=${roomId}`, {
    fetch: (url, init) => fetch(url, { ...init, headers: { ...init?.headers, ...headers } } as any)
  });
  
  let isReady = false;
  let activeProblemId: string | null = null;
  let hasSubmitted = false;

  es.addEventListener("message", async (e: any) => {
    try {
      if (!e.data || e.data.trim() === "ping") return;
      
      const payload = JSON.parse(e.data).payload;
      if (!payload) return;

      if (!isReady) {
        isReady = true;
        // Wait random 3-8s before readying up to simulate human stagger
        await sleep(Math.floor(Math.random() * 5000) + 3000);
        console.log(`[Bot ${botUser.name}] Sending READY signal...`);
        await fetch(`${BASE_URL}/api/contests/rooms/${roomId}/ready`, {
          method: "POST",
          headers
        });
      }

      if (payload.type === "room.state_sync") {
        if (payload.state.status === "active") {
          if (mode === "arena") {
            if (!hasSubmitted) {
              hasSubmitted = true;
              console.log(`[Bot ${botUser.name}] Arena match active! Simulating solves for ${payload.problems.length} problems...`);
              payload.problems.forEach((p: any, idx: number) => {
                if (targetProblemIds && targetProblemIds.length > 0 && !targetProblemIds.includes(p.problemId)) return;
                const delay = Math.floor(Math.random() * 20000) + 15000 + (idx * 20000);
                setTimeout(async () => {
                  if (!isReady) return; // simple check if match is still on
                  console.log(`[Bot ${botUser.name}] Submitting correct solution for ${p.problemId}...`);
                  await fetch(`${BASE_URL}/api/contests/sync`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                      roomId,
                      teamId: teamId || undefined,
                      cfHandle: `testhandle_${botUser.name.replace(/\s+/g, "")}`,
                      problemId: p.problemId
                    })
                  });
                }, delay);
              });
            }
          } else {
            activeProblemId = payload.problems[payload.state.currentProblem || 0]?.problemId;
            
            if (activeProblemId && !hasSubmitted) {
              if (targetProblemIds && targetProblemIds.length > 0 && !targetProblemIds.includes(activeProblemId)) {
                // Skip if not in target list
              } else {
                hasSubmitted = true;
              // Wait 10-25s before simulating correct submission
              const delay = Math.floor(Math.random() * 15000) + 10000;
              console.log(`[Bot ${botUser.name}] Problem revealed! Simulating solving for ${delay/1000}s...`);
              await sleep(delay);
              
              console.log(`[Bot ${botUser.name}] Submitting correct solution for ${activeProblemId}...`);
              await fetch(`${BASE_URL}/api/contests/sync`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  roomId,
                  teamId: teamId || undefined,
                  cfHandle: `testhandle_${botUser.name.replace(/\s+/g, "")}`,
                  problemId: activeProblemId
                })
              });
            }
          }
          }
        }
      }
      
      if (payload.type === "room.advance") {
        activeProblemId = payload.nextProblem?.problemId;
        hasSubmitted = false;
        
        if (activeProblemId) {
          if (targetProblemIds && targetProblemIds.length > 0 && !targetProblemIds.includes(activeProblemId)) {
            // Skip
          } else {
            hasSubmitted = true;
          const delay = Math.floor(Math.random() * 15000) + 10000;
          console.log(`[Bot ${botUser.name}] New Problem! Simulating solving for ${delay/1000}s...`);
          await sleep(delay);
          
          console.log(`[Bot ${botUser.name}] Submitting correct solution for ${activeProblemId}...`);
          await fetch(`${BASE_URL}/api/contests/sync`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              roomId,
              teamId: teamId || undefined,
              cfHandle: `testhandle_${botUser.name.replace(/\s+/g, "")}`,
              problemId: activeProblemId
            })
          });
        }
      }
      }
      
    } catch (err) {}
  });

  return new Promise((resolve) => {
    es.addEventListener("message", (e: any) => {
      try {
        const payload = JSON.parse(e.data).payload;
        if (payload && payload.type === "room.end") {
          es.close();
          resolve(true);
        }
      } catch (err) {}
    });
  });
}

async function main() {
  try {
    console.log("=========================================");
    console.log("       CCW TEST BLADE SIMULATOR          ");
    console.log("=========================================\n");

    const modeChoice = await askQuestion("Select Mode [1] Arena, [2] Blitz (default 2): ");
    const mode = modeChoice === "1" ? "arena" : "blitz";

    const formatChoice = await askQuestion("Select Format [1] 1v1, [2] Solo-Tourney, [3] Team-Tourney (default 3): ");
    const format = formatChoice === "1" ? "1v1" : (formatChoice === "2" ? "solo-tournament" : "team-tournament");

    let maxContestants = 2;
    let teamSize = 1;

    if (format !== "1v1") {
      const maxCStr = await askQuestion("Max Contestants (e.g. 6 or 9): ");
      maxContestants = parseInt(maxCStr) || 6;
      if (format === "team-tournament") {
        const tsStr = await askQuestion("Team Size (e.g. 3): ");
        teamSize = parseInt(tsStr) || 3;
      }
    }

    const duration = 2; // Fixed to 2 minutes for tests
    const problemSelectionMode = "test";

    const targetIdsStr = await askQuestion("Target Problem IDs for Bots to solve (comma-separated, leave blank for auto): ");
    const targetProblemIds = targetIdsStr.trim() ? targetIdsStr.split(',').map(id => id.trim()) : undefined;

    console.log(`\n⏳ Connecting to DB...`);
    await mongoose.connect(MONGODB_URI!);

    // Get dev user to find their object ID
    const devUser = await User.findOne({ email: "k.sonawane@iitg.ac.in" });
    if (!devUser) {
      console.error("❌ Could not find dev user 'k.sonawane@iitg.ac.in'.");
      process.exit(1);
    }

    // 1. Setup Test Bots in DB
    const requiredBots = maxContestants - 1; // 1 slot for dev user
    console.log(`🤖 Provisioning ${requiredBots} Test Bots...`);
    
    const botUsers = [];
    for (let i = 1; i <= requiredBots; i++) {
      const botName = `Test User ${i}`;
      let u = await User.findOne({ name: botName });
      if (!u) {
        u = await User.create({
          name: botName,
          email: `test${i}@codeclub.com`,
          image: `https://ui-avatars.com/api/?name=Test+${i}&background=random`
        });
      }
      
      let cpU = await CPUser.findOne({ userId: u._id.toString() });
      if (!cpU) {
        await CPUser.create({
          userId: u._id.toString(),
          cfHandle: `testhandle_${botName.replace(/\s+/g, "")}`,
          cfRating: 1500,
          verifiedAt: new Date()
        });
      }
      
      botUsers.push(u);
    }

    // 2. Create Contest Document
    const joinCode = crypto.randomBytes(3).toString("hex").substring(0, 6);
    
    const regDelayStr = await askQuestion("How many seconds should the registration period remain open? (default 60): ");
    const regDelay = parseInt(regDelayStr) || 60;
    
    // Start time = Registration Period + 60s Buffer (for check_start worker which runs 1 minute before start)
    const startTime = new Date(Date.now() + ((regDelay + 60) * 1000));

    const contestDoc = await CustomContest.create({
      name: `Test Blade ${mode.toUpperCase()} [${format}]`,
      description: "Automated test blade contest",
      mode,
      format,
      visibility: "public",
      joinCode,
      startTime,
      endTime: new Date(startTime.getTime() + duration * 60000),
      durationSeconds: duration * 60,
      problemSelectionMode,
      bulkProblemCount: 3,
      bulkRatingMin: 800,
      bulkRatingMax: 1200,
      minRating: 0,
      maxRating: 4000,
      maxParticipants: maxContestants,
      teamSize,
      allowSpectators: true,
      creatorId: devUser._id.toString(),
      status: "registration", // MUST BE REGISTRATION FOR WORKER
      registrationSettings: {
        type: "open",
        deadline: new Date(startTime.getTime() - 60000),
        maxParticipants: maxContestants
      },
      registrations: []
    });

    console.log(`\n✅ Created Contest: ${contestDoc._id}`);
    console.log(`Match starts at: ${startTime.toLocaleTimeString()}`);
    console.log(`Duration forced to ${duration} minutes.`);
    
    // Schedule Room Creation (Trigger Worker)
    const { Queue } = require("bullmq");
    const queue = new Queue("reconciliation_queue", {
      connection: {
        url: process.env.REDIS_URL || "redis://localhost:6379"
      }
    });
    
    await queue.add("check_start", { contestId: contestDoc._id.toString() }, { delay: regDelay * 1000 });
    console.log(`✅ Queued 'check_start' event for room creation!`);
    
    // 3. Register Bots
    console.log(`\n▶️  Registering Bots...`);
    const registrations = [];
    
    if (format === "team-tournament") {
      let currentTeamNum = 1;
      let currentTeamCount = 0; 
      
      for (let i = 0; i < botUsers.length; i++) {
        const bot = botUsers[i];
        const tName = `Team Bot ${currentTeamNum}`;
        
        currentTeamCount++;
        if (currentTeamNum === 1 && currentTeamCount >= teamSize - 1) { // Leave 1 slot open in first team
            registrations.push({
              userId: bot._id.toString(),
              cfHandle: `testhandle_${bot.name.replace(/\s+/g, "")}`,
              teamName: tName,
              registeredAt: new Date()
            });
            console.log(`  -> Registered ${bot.name} to '${tName}' (leaving 1 slot for you)`);
            currentTeamNum++;
            currentTeamCount = 0;
            continue;
        } else if (currentTeamCount >= teamSize) {
            currentTeamNum++;
            currentTeamCount = 0;
        }
        
        registrations.push({
          userId: bot._id.toString(),
          cfHandle: `testhandle_${bot.name.replace(/\s+/g, "")}`,
          teamName: tName,
          registeredAt: new Date()
        });
        console.log(`  -> Registered ${bot.name} to '${tName}'`);
      }
    } else {
      // 1v1 or solo-tournament
      for (const bot of botUsers) {
        registrations.push({
          userId: bot._id.toString(),
          cfHandle: `testhandle_${bot.name.replace(/\s+/g, "")}`,
          teamName: bot.name,
          registeredAt: new Date()
        });
        console.log(`  -> Registered ${bot.name} as Solo`);
      }
    }
    
    await CustomContest.updateOne({ _id: contestDoc._id }, { $set: { registrations } });
    console.log(`✅ Bots are registered. Waiting for YOU to manually register via the UI.`);
    console.log(`\nGo straight to:`);
    console.log(`${BASE_URL}/internal/contests`);
    console.log(`And register for '${contestDoc.name}' within the next ${regDelay} seconds!`);
    
    // 4. Poll for Room Creation
    console.log(`\n⏳ Waiting for Agenda to create the room (happens exactly at start time)...`);
    let roomId = null;
    let lastLogTime = 0;
    while (!roomId) {
      const room = await ContestRoom.findOne({ contestId: contestDoc._id });
      if (room) {
        roomId = room._id.toString();
        break;
      }
      
      const now = Date.now();
      if (now - lastLogTime > 2000) {
        const remaining = Math.max(0, Math.ceil((startTime.getTime() - now) / 1000));
        process.stdout.write(`\r  ... waiting (${remaining}s remaining before start time)     `);
        lastLogTime = now;
      }
      await sleep(1000);
    }
    
    console.log(`\n✅ Room created! Room ID: ${roomId}`);

    // 5. Connect Bots via SSE
    console.log(`\n▶️  Spinning up SSE connections and logic for ${botUsers.length} bots...`);
    const roomDoc = await ContestRoom.findById(roomId);
    
    // Need to resolve teamId for bots to submit correctly
    const teamMap: Record<string, string> = {};
    if (format !== "1v1") {
      const dbTeams = await mongoose.connection.db!.collection("contest_teams").find({ roomId: new mongoose.Types.ObjectId(roomId) }).toArray();
      for (const t of dbTeams) {
        for (const mId of t.members) {
          teamMap[mId.toString()] = t._id.toString();
        }
      }
    }

    const botPromises = botUsers.map(bot => {
      const tId = teamMap[bot._id.toString()] || null;
      return runBotClient(bot, roomId!, contestDoc._id.toString(), tId, mode, targetProblemIds);
    });

    console.log(`⏳ Bots are alive. Waiting for match to end...`);
    await Promise.all(botPromises);
    
    console.log(`\n🎉 Test Blade Simulation Complete! The match has officially ended.`);
    process.exit(0);

  } catch (error) {
    console.error("Fatal Error:", error);
    process.exit(1);
  }
}

main();
