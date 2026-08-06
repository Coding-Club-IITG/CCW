import mongoose, { Schema, Document } from "mongoose";
import {
  ProjectModuleName,
  PROJECT_MODULES,
  ProjectStatus,
  PROJECT_STATUSES,
} from "@/lib/constants";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";

export interface IProject extends Document {
  title: string;
  description: string;
  date: Date;
  module: ProjectModuleName;
  status: ProjectStatus;
  repoLink: string;
  coverImage?: string;
  coverFocalPoint: ImageFocalPoint;
  tags: string[];
}

const ProjectSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    module: {
      type: String,
      enum: PROJECT_MODULES,
      required: true,
    },
    status: {
      type: String,
      enum: PROJECT_STATUSES,
      required: true,
    },
    repoLink: { type: String, required: true },
    coverImage: { type: String },
    coverFocalPoint: {
      x: { type: Number, min: 0, max: 1, default: 0.5 },
      y: { type: Number, min: 0, max: 1, default: 0.5 },
      _id: false,
    },
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.models.Project ||
  mongoose.model<IProject>("Project", ProjectSchema);
