import mongoose from "mongoose";
import {
  ACCESS_LEVELS,
  CLUB_POSITIONS,
  CURRENT_TENURE,
  MODULES,
  MODULE_POSITIONS,
} from "@/lib/constants";

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    image: String,
    access: {
      type: String,
      enum: ACCESS_LEVELS,
      default: "Member",
    },
    tenure: { type: String, required: true, default: CURRENT_TENURE },
    managedModules: [{ type: String, enum: MODULES }],
    roles: [
      {
        module: { type: String, enum: MODULES, required: false },
        position: {
          type: String,
          enum: [...CLUB_POSITIONS, ...MODULE_POSITIONS],
          required: true,
        },
        _id: false,
      },
    ],
    codeforcesId: { type: String, default: "" },
    atcoderId: { type: String, default: "" },
    githubId: { type: String, default: "" },
    bio: { type: String, default: "" },
    phoneNumber: { type: String, default: "" },
    pizza_count: { type: Number, default: 0 },
  },
  { timestamps: true },
);

UserSchema.index({ tenure: 1 });
UserSchema.index({ "roles.position": 1 });
UserSchema.index({ "roles.module": 1 });
UserSchema.pre("validate", function () {
  if (
    !/^\d{4}-\d{2}$/.test(this.tenure) ||
    (Number(this.tenure.slice(0, 4)) + 1) % 100 !== Number(this.tenure.slice(5))
  ) {
    this.invalidate(
      "tenure",
      "Tenure must be a consecutive academic year in YYYY-YY format.",
    );
  }
  if (this.access !== "Head") this.managedModules = [];
  if (this.access === "Head" && this.managedModules.length === 0)
    this.invalidate("managedModules", "Head access requires a managed module.");
  if (this.access === "Head") this.roles.splice(0);
  const keys = new Set<string>();
  for (const role of this.roles) {
    const club =
      !role.module && CLUB_POSITIONS.includes(role.position as never);
    const modulePosition =
      !!role.module &&
      MODULES.includes(role.module as never) &&
      MODULE_POSITIONS.includes(role.position as never);
    if (!club && !modulePosition)
      this.invalidate("roles", "Invalid role combination.");
    const key = `${role.module ?? "club"}:${role.position}`;
    if (keys.has(key))
      this.invalidate("roles", "Duplicate roles are not allowed.");
    keys.add(key);
  }
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
