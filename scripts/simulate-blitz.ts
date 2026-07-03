import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

const UserSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.models.User || mongoose.model("User", UserSchema);

const CPUserSchema = new mongoose.Schema({}, { strict: false });
const CPUser = mongoose.models.CPUser || mongoose.model("CPUser", CPUserSchema);

const SessionSchema = new mongoose.Schema({
  token: String,
  userId: String,
  expiresAt: Date,
  createdAt: Date,
  updatedAt: Date
}, { strict: false });
const Session = mongoose.models.Session || mongoose.model("Session", SessionSchema, "session");

const ContestSchema = new mongoose.Schema({}, { strict: false });
const CustomContest = mongoose.models.CustomContest || mongoose.model("CustomContest", ContestSchema, "custom_contests");

const ContestRoomSchema = new mongoose.Schema({}, { strict: false });
const ContestRoom = mongoose.models.ContestRoom || mongoose.model("ContestRoom", ContestRoomSchema, "contest_rooms");

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateBlitz() {
  try {
    await mongoose.connect(MONGODB_URI!);
    console.log("✅ Connected to MongoDB");

    // 1. Find a test user (Test User 1)
    const testUser = await User.findOne({ email: "testuser1@test.com" });
    if (!testUser) {
      throw new Error("Test User 1 not found. Please run the seed script first.");
    }
    const userId = testUser._id.toString();
    console.log(`✅ Using Test User 1 (ID: ${userId})`);

    // 3. Find a Blitz Contest in registration
    const contest = await CustomContest.findOne({ mode: "blitz", status: "registration" });
    if (!contest) {
      throw new Error("No Blitz contest in 'registration' status found. Create one from the UI first.");
    }
    const contestId = contest._id.toString();
    console.log(`✅ Found Registration Blitz Contest: ${contest.name} (ID: ${contestId})`);

    // 4. Register for the contest via API
    console.log(`\n▶️  Registering for contest...`);
    const regRes = await fetch(`${BASE_URL}/api/contests/${contestId}/register`, {
      method: "POST",
      headers: {
        "x-test-user-id": userId,
        "Content-Type": "application/json"
      }
    });
    
    if (regRes.status === 409) {
      console.log("✅ Already registered.");
    } else if (!regRes.ok) {
      const err = await regRes.text();
      throw new Error(`Failed to register: ${regRes.status} ${err}`);
    } else {
      console.log("✅ Successfully registered.");
    }

    // --- HELPER TO PROCESS ROOM ---
    async function processRoom(rId: string) {
      console.log(`✅ Found Room ID: ${rId}`);
      
      console.log(`\n▶️  Switching SSE connection to Room channel...`);
      const roomSseRes = await fetch(`${BASE_URL}/api/events?roomId=${rId}`, {
        headers: {
          "x-test-user-id": userId,
          "Accept": "text/event-stream"
        }
      });
      
      console.log(`\n▶️  Waiting 30 seconds before clicking "Ready" to simulate real player delay...`);
      await sleep(30000);
      
      console.log(`\n▶️  Sending "I am ready"...`);
      const readyRes = await fetch(`${BASE_URL}/api/contests/rooms/${rId}/ready`, {
        method: "POST",
        headers: {
          "x-test-user-id": userId,
          "Content-Type": "application/json"
        }
      });
      
      if (readyRes.ok) {
        console.log("✅ Successfully marked ready.");
      } else {
        console.error("❌ Failed to mark ready", await readyRes.text());
        return;
      }
      
      if (roomSseRes.ok && roomSseRes.body) {
        const roomReader = roomSseRes.body.getReader();
        const roomDecoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value: rValue, done: rDone } = await roomReader.read();
          if (rDone) break;
          
          buffer += roomDecoder.decode(rValue, { stream: true });
          const rLines = buffer.split('\n');
          buffer = rLines.pop() || "";
          
          for (const rLine of rLines) {
            if (rLine.startsWith("data: ")) {
              try {
                const rPayload = JSON.parse(rLine.replace("data: ", "").trim());
                
                // Listen for room.state_sync which contains problems
                if (rPayload.payload && rPayload.payload.type === "room.state_sync" && rPayload.payload.problems) {
                  const problems = rPayload.payload.problems;
                  if (problems.length > 0) {
                    const firstProblem = problems[0];
                    console.log(`✅ Problem Revealed: ${firstProblem.name} (${firstProblem.problemId})`);
                    
                    console.log(`\n▶️  Simulating solving process for 5 seconds...`);
                    await sleep(5000);
                    
                    console.log(`▶️  Submitting solution...`);
                    const syncRes = await fetch(`${BASE_URL}/api/contests/sync`, {
                      method: "POST",
                      headers: {
                        "x-test-user-id": userId,
                        "Content-Type": "application/json"
                      },
                      body: JSON.stringify({
                        roomId: rId,
                        cfHandle: "testhandle1",
                        problemId: firstProblem.problemId
                      })
                    });
                    
                    if (syncRes.status === 202) {
                      console.log("✅ Solution sync queued successfully!");
                      console.log("🎉 Simulation complete.");
                      process.exit(0);
                    } else {
                      console.error("❌ Failed to queue sync", await syncRes.text());
                    }
                  }
                }
              } catch (e) {}
            }
          }
        }
      }
    }
    // --- END HELPER ---

    // 5. Connect to SSE
    console.log(`\n▶️  Checking if contest is already active...`);
    const currentContest = await CustomContest.findById(contestId);
    
    if (currentContest.status === "active") {
      console.log("✅ Contest is ALREADY ACTIVE! Skipping contest stream and finding Room ID...");
      const room = await ContestRoom.findOne({ contestId: currentContest._id, participants: new mongoose.Types.ObjectId(userId) });
      if (room) {
        await processRoom(room._id.toString());
      } else {
        console.log("❌ Room not found yet.");
      }
      return; // Exit main flow after room processes (or fails)
    }

    console.log(`⏳ Waiting for the scheduled contest start time...`);
    console.log(`   (This will take exactly as long as you scheduled it for. E.g., if you clicked "+2 mins", it will wait ~1 minute for the active phase).`);
    console.log(`   Please be patient and DO NOT cancel the script...`);

    while (true) {
      const c = await CustomContest.findById(contestId);
      if (!c) {
        console.error("\n❌ FATAL: Contest was deleted by the backend! (Usually because it reached start time with < 2 registrations. Make sure you click 'Self-register' when creating the contest).");
        process.exit(1);
      }
      
      if (c.status === "active") {
        console.log("\n✅ Contest is now ACTIVE! Finding Room ID...");
        
        await sleep(1000); // Give backend a sec to create room
        const room = await ContestRoom.findOne({ contestId: contest._id, participants: new mongoose.Types.ObjectId(userId) });
        if (room) {
          await processRoom(room._id.toString());
          return;
        } else {
          console.error("❌ Room not found after contest became active!");
          process.exit(1);
        }
      }
      
      await sleep(5000); // Poll every 5 seconds
    }
  } catch (err) {
    console.error("Simulation error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

simulateBlitz();
