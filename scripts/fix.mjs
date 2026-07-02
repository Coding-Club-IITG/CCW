import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const MONGODB_URI = process.env.MONGODB_URI;

async function r(){ 
  await mongoose.connect(MONGODB_URI); 
  const db = mongoose.connection.db; 
  const room = await db.collection("contest_rooms").find().sort({_id: -1}).limit(1).toArray(); 
  if (room.length > 0) {
    const existing = await db.collection("contest_problem_sets").findOne({roomId: room[0]._id});
    if (!existing) {
      const problemSet = { 
        contestId: room[0].contestId, 
        roomId: room[0]._id, 
        problems: [{ platform: "codeforces", problemId: "2236A", name: "Games on the Train", rating: 800, points: 100 }], 
        createdAt: new Date(), 
        updatedAt: new Date() 
      }; 
      await db.collection("contest_problem_sets").insertOne(problemSet); 
      console.log("Fixed ProblemSet"); 
    }
  }
  await mongoose.disconnect(); 
} 
r();
