import mongoose, { Schema, Document, Types } from "mongoose";
import {
  CLUB_POSITIONS,
  MODULES,
  MODULE_POSITIONS,
  type ClubPosition,
  type ModuleName,
  type ModulePosition,
} from "@/lib/constants";

// Sub-document interfaces

export interface IAccessControl {
  // Visible to every authenticated club member
  allMembers: boolean;
  // Allow access if user belongs to any of these modules
  allowedModules: ModuleName[];
  // Allow access if user has one of these club positions
  allowedClubPositions: ClubPosition[];
  // Allow access if user holds one of these roles in ANY module
  allowedModulePositions: ModulePosition[];
  // Allow access for specific users by their ID
  allowedUsers: Types.ObjectId[];
}

export interface IFileEntry extends Document {
  title: string;
  description: string;

  // The original filename shown to users
  originalName: string;
  /**
   * The UUID-based filename stored on disk
   * Never exposed to clients; the /api/files/[id] endpoint handles serving.
   */
  storedName: string;

  mimeType: string;
  // File size in bytes
  size: number;

  /**
   * Logical folder / Category label
   * Purely organisational - ACL is always per-file.
   */
  folder: string;

  // Denormalised for display
  uploadedBy: Types.ObjectId;
  uploadedByName: string;

  // The module context of the upload
  uploaderModule: ModuleName | null;

  // Content-Disposition: attachment if true, else inline (view only)
  isDownloadable: boolean;

  accessControl: IAccessControl;
  createdAt: Date;
  updatedAt: Date;
}

// Schema

const AccessControlSchema = new Schema<IAccessControl>(
  {
    allMembers: { type: Boolean, default: false },
    allowedModules: [{ type: String, enum: MODULES }],
    allowedClubPositions: [{ type: String, enum: CLUB_POSITIONS }],
    allowedModulePositions: [{ type: String, enum: MODULE_POSITIONS }],
    allowedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false },
);

const FileEntrySchema = new Schema<IFileEntry>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 1000 },

    originalName: { type: String, required: true },
    storedName: { type: String, required: true, unique: true },

    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },

    folder: { type: String, default: "General", trim: true, maxlength: 100 },

    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    uploadedByName: { type: String, required: true },
    uploaderModule: { type: String, default: null },

    isDownloadable: { type: Boolean, default: true },

    accessControl: {
      type: AccessControlSchema,
      default: () => ({
        allMembers: false,
        allowedModules: [],
        allowedClubPositions: [],
        allowedModulePositions: [],
        allowedUsers: [],
      }),
    },
  },
  { timestamps: true },
);

// Compound index for efficient per-module queries
FileEntrySchema.index({ uploaderModule: 1, createdAt: -1 });
FileEntrySchema.index({ uploadedBy: 1, createdAt: -1 });

export default mongoose.models.FileEntry ||
  mongoose.model<IFileEntry>("FileEntry", FileEntrySchema);
