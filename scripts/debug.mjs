import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const MONGODB_URI = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  
  const allPs = await db.collection("contest_problem_sets").find().sort({_id: -1}).limit(5).toArray();
  console.log("Latest ProblemSets:", allPs);
  
  await mongoose.disconnect();
}
run();
