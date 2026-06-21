import mongoose from "mongoose";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const MONGODB_URI = process.env.MONGODB_URI;

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  emailVerified: { type: Boolean, default: false },
  role: String,
  moduleRoles: Array,
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);

async function seed() {
  await mongoose.connect(MONGODB_URI!);
  const devUser = {
    name: "Coding Club IITG",
    email: "codingclub@iitg.ac.in",
    role: "Secretary",
    moduleRoles: [],
    emailVerified: true,
  };
  await User.findOneAndUpdate({ email: devUser.email }, devUser, {
    upsert: true,
  });
  console.log("✅ Seeded dev user:", devUser.email);
  await mongoose.disconnect();
}

seed();
