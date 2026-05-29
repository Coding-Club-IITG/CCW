import mongoose from "mongoose";
import { GLOBAL_ROLES, MODULES, MODULE_ROLES } from "@/lib/constants";

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    image: String,
    role: {
      type: String,
      enum: GLOBAL_ROLES,
      default: "Member",
    },
    moduleRoles: [
      {
        module: {
          type: String,
          enum: MODULES,
        },
        role: {
          type: String,
          enum: MODULE_ROLES,
          required: false,
        },
      },
    ],
    codeforcesId: { type: String, default: "" },
    atcoderId: { type: String, default: "" },
    githubId: { type: String, default: "" },
    bio: { type: String, default: "" },
    phoneNumber: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.models.User || mongoose.model("User", UserSchema);
