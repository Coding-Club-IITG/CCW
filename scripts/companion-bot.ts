import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";
import readline from "readline";
import { EventSource } from "eventsource";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.models.User || mongoose.model("User", UserSchema);
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
async function runBotClient(botUser: any, roomId: string, teamId: string | null, mode: string, readyDelayMs: number) {
  const headers = { 
    "x-test-user-id": botUser._id.toString(),
    "Content-Type": "application/json"
  };
  
  console.log(`\n[Bot ${botUser.name}] Connecting to SSE EventSource for room ${roomId}...`);
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
        console.log(`[Bot ${botUser.name}] Connected! Waiting for ${readyDelayMs / 1000}s before sending READY signal...`);
        await sleep(readyDelayMs);
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
              console.log(`[Bot ${botUser.name}] Arena match active! Simulating solves for ${payload.problems?.length || 0} problems...`);
              payload.problems?.forEach((p: any, idx: number) => {
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
            activeProblemId = payload.problems?.[payload.state.currentProblem || 0]?.problemId;
            
            if (activeProblemId && !hasSubmitted) {
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
      
      if (payload.type === "room.advance") {
        activeProblemId = payload.nextProblem?.problemId;
        hasSubmitted = false;
        
        if (activeProblemId) {
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
      
    } catch (err) {}
  });

  return new Promise((resolve) => {
    es.addEventListener("message", (e: any) => {
      try {
        const payload = JSON.parse(e.data).payload;
        if (payload && payload.type === "room.end") {
          console.log(`[Bot ${botUser.name}] Received room.end event, closing connection.`);
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
    console.log("       CCW COMPANION BOT SCRIPT          ");
    console.log("=========================================\n");

    const roomId = await askQuestion("Enter Room ID to join (from the URL /contests/room/<id>): ");
    if (!roomId) {
      console.error("❌ Room ID is required.");
      process.exit(1);
    }
    
    const finalBotName = "Test User 1";
    console.log(`Using seeded bot: ${finalBotName}`);

    const readyDelayStr = await askQuestion("Enter Ready Delay in seconds (default 5): ");
    const readyDelayMs = (parseInt(readyDelayStr) || 5) * 1000;

    console.log(`\n⏳ Connecting to DB...`);
    await mongoose.connect(MONGODB_URI!);

    // Get bot user to find their object ID
    const botUser = await User.findOne({ name: finalBotName });
    if (!botUser) {
      console.error(`❌ Could not find bot user '${finalBotName}'.`);
      process.exit(1);
    }

    const roomDoc = await ContestRoom.findById(roomId);
    if (!roomDoc) {
      console.error(`❌ Could not find Room ID '${roomId}' in DB.`);
      process.exit(1);
    }
    
    const ContestSchema = new mongoose.Schema({}, { strict: false });
    const CustomContest = mongoose.models.CustomContest || mongoose.model("CustomContest", ContestSchema, "custom_contests");
    const contestDoc = await CustomContest.findById(roomDoc.contestId);
    const mode = contestDoc ? contestDoc.mode : "blitz";

    // Need to resolve teamId for the bot
    let teamId = null;
    if (contestDoc && contestDoc.format !== "1v1") {
      const dbTeams = await mongoose.connection.db!.collection("contest_teams").find({ roomId: new mongoose.Types.ObjectId(roomId) }).toArray();
      for (const t of dbTeams) {
        if (t.members.some((mId: any) => mId.toString() === botUser._id.toString())) {
          teamId = t._id.toString();
          break;
        }
      }
    }

    console.log(`\n✅ Found Bot User: ${botUser._id.toString()} (${botUser.name})`);
    if (teamId) {
      console.log(`✅ Found Team ID: ${teamId}`);
    }
    console.log(`✅ Mode detected: ${mode.toUpperCase()}`);
    console.log(`✅ Starting Companion Bot Client for Room ${roomId}...`);
    
    await runBotClient(botUser, roomId, teamId, mode, readyDelayMs);
    
    console.log(`\n🎉 Companion Bot Disconnected.`);
    process.exit(0);

  } catch (error) {
    console.error("Fatal Error:", error);
    process.exit(1);
  }
}

main();
