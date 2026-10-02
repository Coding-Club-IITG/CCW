import mongoose, { Schema } from "mongoose";

import { MODULES } from "@/lib/constants";

const SharingGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", maxlength: 500 },
    module: { type: String, enum: MODULES, default: null },
    memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Serializes granting access against group deletion in a transaction
    grantRevision: { type: Number, default: 0 },
  },
  { timestamps: true, optimisticConcurrency: true },
);

SharingGroupSchema.index({ memberIds: 1 });
SharingGroupSchema.index({ name: 1, _id: 1 });

export type SharingGroupRecord = mongoose.InferSchemaType<
  typeof SharingGroupSchema
>;
export default (mongoose.models.SharingGroup as
  mongoose.Model<SharingGroupRecord> | undefined) ||
  mongoose.model<SharingGroupRecord>("SharingGroup", SharingGroupSchema);
