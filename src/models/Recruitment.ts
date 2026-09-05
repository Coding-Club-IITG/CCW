import mongoose, { Schema, type Types } from "mongoose";

import {
  MODULES,
  RECRUITMENT_MAX_YEAR,
  RECRUITMENT_MIN_YEAR,
  RECRUITMENT_SEASONS,
  RECRUITMENT_STATUSES,
  type ModuleName,
  type RecruitmentSeason,
  type RecruitmentStatus,
} from "@/lib/constants";

export interface IRecruitmentDocument {
  _id: Types.ObjectId;
  originalName: string;
  storedName: string;
  mimeType: "application/pdf";
  size: number;
}

export interface IRecruitmentSlot {
  releaseAt: Date | null;
  document: IRecruitmentDocument | null;
}

export interface IRecruitmentModule {
  module: ModuleName;
  resources: IRecruitmentSlot;
  task: IRecruitmentSlot;
  submissionDeadline: Date | null;
}

export interface IRecruitment {
  _id: Types.ObjectId;
  year: number;
  season: RecruitmentSeason;
  slug: string;
  label: string;
  status: RecruitmentStatus;
  publishedAt: Date | null;
  modules: IRecruitmentModule[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema<IRecruitmentDocument>({
  originalName: { type: String, required: true, maxlength: 255 },
  storedName: { type: String, required: true },
  mimeType: { type: String, enum: ["application/pdf"], required: true },
  size: { type: Number, required: true, min: 1 },
});

const SlotSchema = new Schema<IRecruitmentSlot>(
  {
    releaseAt: { type: Date, default: null },
    document: { type: DocumentSchema, default: null },
  },
  { _id: false },
);

const ModuleSchema = new Schema<IRecruitmentModule>(
  {
    module: { type: String, enum: MODULES, required: true },
    resources: { type: SlotSchema, default: () => ({}) },
    task: { type: SlotSchema, default: () => ({}) },
    submissionDeadline: { type: Date, default: null },
  },
  { _id: false },
);

const RecruitmentSchema = new Schema<IRecruitment>(
  {
    year: {
      type: Number,
      required: true,
      min: RECRUITMENT_MIN_YEAR,
      max: RECRUITMENT_MAX_YEAR,
      validate: Number.isInteger,
    },
    season: { type: String, enum: RECRUITMENT_SEASONS, required: true },
    slug: { type: String, required: true },
    label: { type: String, required: true },
    status: { type: String, enum: RECRUITMENT_STATUSES, default: "draft" },
    publishedAt: { type: Date, default: null },
    modules: {
      type: [ModuleSchema],
      default: () =>
        MODULES.map((module) => ({
          module,
          resources: { releaseAt: null, document: null },
          task: { releaseAt: null, document: null },
          submissionDeadline: null,
        })),
      validate: (modules: IRecruitmentModule[]) =>
        modules.length === MODULES.length &&
        MODULES.every(
          (name) =>
            modules.filter((entry) => entry.module === name).length === 1,
        ),
    },
    createdBy: { type: Schema.Types.ObjectId, required: true, ref: "User" },
  },
  { timestamps: true, optimisticConcurrency: true },
);

RecruitmentSchema.pre("validate", function () {
  this.slug = `${this.year}-${this.season?.toLowerCase()}`;
  this.label = `${this.year} ${this.season}`;
});
RecruitmentSchema.index({ year: 1, season: 1 }, { unique: true });
RecruitmentSchema.index({ slug: 1 }, { unique: true });
RecruitmentSchema.index({ "modules.resources.document._id": 1 });
RecruitmentSchema.index({ "modules.task.document._id": 1 });

export default (mongoose.models.Recruitment as
  mongoose.Model<IRecruitment> | undefined) ||
  mongoose.model<IRecruitment>("Recruitment", RecruitmentSchema);
