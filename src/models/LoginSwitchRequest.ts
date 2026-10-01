import mongoose from "mongoose";
import { LOGIN_SWITCH_STATUSES } from "@/lib/constants";

const LoginSwitchRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sourceEmail: { type: String, required: true },
    sourceAccountId: { type: String, required: true },
    sourceSessionId: { type: String, required: true },
    googleEmail: { type: String, required: true },
    googleAccountId: { type: String, required: true },
    status: {
      type: String,
      enum: LOGIN_SWITCH_STATUSES,
      required: true,
      default: "draft",
    },
    active: { type: Boolean, required: true, default: true },
    verifiedAt: { type: Date, required: true },
    submittedAt: Date,
    expiresAt: { type: Date, required: true },
    reviewedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reason: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

LoginSwitchRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
LoginSwitchRequestSchema.index({ status: 1, submittedAt: -1, _id: -1 });
export type LoginSwitchRecord = mongoose.InferSchemaType<
  typeof LoginSwitchRequestSchema
>;
const LoginSwitchRequest =
  (mongoose.models.LoginSwitchRequest as
    mongoose.Model<LoginSwitchRecord> | undefined) ||
  mongoose.model<LoginSwitchRecord>(
    "LoginSwitchRequest",
    LoginSwitchRequestSchema,
  );
export default LoginSwitchRequest;
