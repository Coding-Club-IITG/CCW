import mongoose, { Schema } from "mongoose";

const SharingGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, default: "", maxlength: 500 },
    managerIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    // Serializes file mutations against group permission changes and deletion
    grantRevision: { type: Number, default: 0 },
  },
  { timestamps: true, optimisticConcurrency: true },
);

SharingGroupSchema.index({ memberIds: 1 });
SharingGroupSchema.index({ managerIds: 1 });
SharingGroupSchema.index({ name: 1, _id: 1 });

export type SharingGroupRecord = mongoose.InferSchemaType<
  typeof SharingGroupSchema
>;
export default (mongoose.models.SharingGroup as
  mongoose.Model<SharingGroupRecord> | undefined) ||
  mongoose.model<SharingGroupRecord>("SharingGroup", SharingGroupSchema);
