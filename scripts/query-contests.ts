import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;

const ContestSchema = new mongoose.Schema({}, { strict: false });
const CustomContest = mongoose.models.CustomContest || mongoose.model("CustomContest", ContestSchema, "custom_contests");

const ContestRoomSchema = new mongoose.Schema({}, { strict: false });
const ContestRoom = mongoose.models.ContestRoom || mongoose.model("ContestRoom", ContestRoomSchema, "contest_rooms");

const ContestTeamSchema = new mongoose.Schema({}, { strict: false });
const ContestTeam = mongoose.models.ContestTeam || mongoose.model("ContestTeam", ContestTeamSchema, "contest_teams");

async function queryContests() {
  try {
    if (!MONGODB_URI) {
      throw new Error("MONGODB_URI is not defined in .env.local");
    }

    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    const contests = await CustomContest.find({});
    console.log("================= CUSTOM CONTESTS =================");
    console.log(JSON.stringify(contests, null, 2));
    console.log(`Total Contests: ${contests.length}\n`);

    const rooms = await ContestRoom.find({});
    console.log("================= CONTEST ROOMS =================");
    console.log(JSON.stringify(rooms, null, 2));
    console.log(`Total Rooms: ${rooms.length}\n`);

    const teams = await ContestTeam.find({});
    console.log("================= CONTEST TEAMS =================");
    console.log(JSON.stringify(teams, null, 2));
    console.log(`Total Teams: ${teams.length}\n`);

  } catch (error) {
    console.error("❌ Error querying database:", error);
  } finally {
    await mongoose.disconnect();
    console.log("✅ Disconnected from MongoDB");
  }
}

queryContests();
