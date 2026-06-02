import mongoose, { Schema, Document } from "mongoose";
import {
  ProjectModuleName,
  PROJECT_MODULES,
  ProjectStatus,
  PROJECT_STATUSES,
} from "@/lib/constants";

export interface IProject extends Document {
  title: string;
  description: string;
  date: Date;
  module: ProjectModuleName;
  status: ProjectStatus;
  repoLink: string;
  coverImage?: string;
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
    tags: { type: [String], default: [] },
  },
  { timestamps: true },
);

export default mongoose.models.Project ||
  mongoose.model<IProject>("Project", ProjectSchema);
