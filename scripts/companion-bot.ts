import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });

import ContestRoom from "../src/models/ContestRoom";
import ContestMatch from "../src/models/ContestMatch";
import ContestTeam from "../src/models/ContestTeam";
import CPUser from "../src/models/CPUser";
import User from "../src/models/User";

/**
 * Companion Bot Script
 * Usage: npx tsx scripts/companion-bot.ts <roomId> [delaySeconds]
 */
async function run() {
  const roomId = process.argv[2];
  const delaySec = parseInt(process.argv[3] || "10");

  if (!roomId) {
    console.error("Usage: npx tsx scripts/companion-bot.ts <roomId> [delaySeconds]");
    process.exit(1);
  }

  // Ensure all models are registered
  User.schema;
  CPUser.schema;
  ContestTeam.schema;
  ContestMatch.schema;
  ContestRoom.schema;

  console.log("Connecting to MongoDB...");
  await mongoose.connect(process.env.MONGODB_URI as string);
  console.log("Connected to MongoDB.");

  // Fetch room
  const room = await ContestRoom.findById(roomId);
  if (!room) {
    console.error(`Room with ID ${roomId} not found`);
    process.exit(1);
  }

  // Participants array in DB sometimes contains User IDs instead of CPUser IDs
  // We'll manually fetch the corresponding Users
  const participantIds = room.participants;
  let botUserId = "";
  let botHandle = "companion_bot";

  const users = await User.find({ _id: { $in: participantIds } });
  
  // Find the other user (not 'dev' and not 'ronits2407')
  // Also exclude 'coding club iitg' if that's the display name of ronits2407
  const excludeNames = ["dev", "ronits2407", "coding club iitg"];
  const botUser = users.find(u => {
    const un = (u.username || "").toLowerCase();
    const nm = (u.name || "").toLowerCase();
    const hd = (u.codeforces_handle || "").toLowerCase();
    return !excludeNames.includes(un) && !excludeNames.includes(nm) && !excludeNames.includes(hd);
  });

  if (botUser) {
    botUserId = botUser._id.toString();
    botHandle = botUser.codeforces_handle || botUser.username || botUser.name || "companion_bot";
  } else {
    // If not found in User, maybe they are CPUser IDs? Let's check CPUser
    const cpUsers = await CPUser.find({ _id: { $in: participantIds } }).populate("userId");
    const botCpUser = cpUsers.find(cpu => {
      const u = cpu.userId as any;
      if (!u) return false;
      const un = (u.username || "").toLowerCase();
      const nm = (u.name || "").toLowerCase();
      const hd = (cpu.cfHandle || "").toLowerCase();
      return !excludeNames.includes(un) && !excludeNames.includes(nm) && !excludeNames.includes(hd);
    });

    if (botCpUser) {
      botUserId = (botCpUser.userId as any)._id.toString();
      botHandle = botCpUser.cfHandle || "companion_bot";
    }
  }

  if (!botUserId) {
    console.error("Could not find a companion bot participant (non-dev user) in the room.");
    process.exit(1);
  }
  console.log(`\nSelected companion bot user: ${botHandle} (${botUserId})`);

  // Connect to SSE first
  const sseUrl = `http://localhost:3000/api/contests/stream?roomId=${roomId}`;
  console.log(`[BOT] Connecting to SSE at ${sseUrl}`);
  
  const abortController = new AbortController();

  try {
    // Keep connection alive in the background
    fetch(sseUrl, {
      signal: abortController.signal,
      headers: {
        "x-test-user-id": botUserId
      }
    }).then(async res => {
      if (res.ok) {
        console.log(`[BOT] SSE connected successfully!`);
        if (res.body) {
          const reader = res.body.getReader();
          try {
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          } catch (e) {
            // Ignore abort errors when we close it
          }
        }
      } else {
        console.error(`[BOT] SSE connection failed: ${res.status}`);
      }
    }).catch(err => {
      console.error("[BOT] SSE fetch error:", err);
    });
  } catch (err) {
    console.error("[BOT] Failed to initiate SSE:", err);
  }

  console.log(`\nWaiting ${delaySec} seconds before hitting the 'ready' endpoint...`);
  await new Promise((r) => setTimeout(r, delaySec * 1000));

  // Hit the ready endpoint
  const readyUrl = `http://localhost:3000/api/contests/rooms/${roomId}/ready`;
  console.log(`[BOT] POST ${readyUrl}`);
  
  try {
    const readyRes = await fetch(readyUrl, {
      method: "POST",
      headers: {
        "x-test-user-id": botUserId
      }
    });

    if (!readyRes.ok) {
      console.error(`[BOT] Ready endpoint failed with status: ${readyRes.status}`);
      console.error(await readyRes.text());
    } else {
      console.log(`[BOT] Ready endpoint success!`);
    }
  } catch (err) {
    console.error("[BOT] Error calling ready endpoint:", err);
  }

  console.log("\nClosing connections...");
  abortController.abort(); // Close the SSE stream to prevent libuv crash on Windows

  // Let the abort propagate and close mongoose gracefully
  await new Promise(resolve => setTimeout(resolve, 500));
  await mongoose.disconnect();

  console.log("Bot sequence completed. Exiting...");
  process.exit(0);
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
