import mongoose from "mongoose";
import {
  ACCESS_LEVELS,
  ROLE_CLUB_POSITIONS,
  ROLE_MODULES,
  CURRENT_TENURE,
  MODULES,
  MODULE_POSITIONS,
} from "@/lib/constants";
import { validateRoles } from "@/lib/users/roles";

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true, sparse: true },
    instituteEmail: { type: String },
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
        module: { type: String, enum: ROLE_MODULES, required: false },
        position: {
          type: String,
          enum: [...ROLE_CLUB_POSITIONS, ...MODULE_POSITIONS],
          required: true,
        },
        _id: false,
      },
    ],
    codeforcesId: { type: String, default: "" },
    atcoderId: { type: String, default: "" },
    githubId: { type: String, default: "" },
    linkedinUrl: { type: String, default: "" },
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
  const scoped = this.access === "Head" || this.access === "Core Team";
  if (!scoped) this.managedModules = [];
  if (scoped && this.managedModules.length === 0)
    this.invalidate(
      "managedModules",
      `${this.access} access requires a managed module.`,
    );
  const validation = validateRoles(this.roles.toObject(), this.tenure);
  if (!validation.success) this.invalidate("roles", validation.error);
});

export type UserRecord = mongoose.InferSchemaType<typeof UserSchema>;

const User =
  (mongoose.models.User as mongoose.Model<UserRecord> | undefined) ||
  mongoose.model<UserRecord>("User", UserSchema);

export default User;
