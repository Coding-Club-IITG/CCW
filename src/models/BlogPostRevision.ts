import mongoose, { Schema, Document, Types } from "mongoose";

import type { ImageFocalPoint } from "@/lib/imageFocalPoint";

export const BLOG_REVISION_SOURCES = [
  "initial_publish",
  "admin_edit",
  "approved_revision",
  "rollback",
] as const;

export type BlogRevisionSource = (typeof BLOG_REVISION_SOURCES)[number];

export interface IBlogPostRevisionAuthor {
  userId: Types.ObjectId;
  name: string;
}

export interface IBlogPostRevisionEditor {
  userId: Types.ObjectId;
  name: string;
}

export interface IBlogPostRevision extends Document {
  postId: Types.ObjectId;
  slug: string;
  version: number;
  title: string;
  content: string;
  excerpt: string;
  coverImage: string;
  coverFocalPoint: ImageFocalPoint;
  tags: string[];
  authors: IBlogPostRevisionAuthor[];
  editor: IBlogPostRevisionEditor;
  approvedBy: IBlogPostRevisionEditor | null;
  source: BlogRevisionSource;
  restoredFromVersion: number | null;
  changeSummary: string | null;
  createdAt: Date;
}

const RevisionAuthorSchema = new Schema<IBlogPostRevisionAuthor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

const RevisionEditorSchema = new Schema<IBlogPostRevisionEditor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

const BlogPostRevisionSchema = new Schema<IBlogPostRevision>(
  {
    postId: {
      type: Schema.Types.ObjectId,
      ref: "BlogPost",
      required: true,
      index: true,
    },
    slug: { type: String, required: true, trim: true },
    version: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, default: "" },
    excerpt: { type: String, default: "", maxlength: 500 },
    coverImage: { type: String, default: "" },
    coverFocalPoint: {
      x: { type: Number, min: 0, max: 1, default: 0.5 },
      y: { type: Number, min: 0, max: 1, default: 0.5 },
      _id: false,
    },
    tags: [{ type: String }],
    authors: { type: [RevisionAuthorSchema], default: [] },
    editor: { type: RevisionEditorSchema, required: true },
    approvedBy: { type: RevisionEditorSchema, default: null },
    source: {
      type: String,
      enum: BLOG_REVISION_SOURCES,
      required: true,
    },
    restoredFromVersion: { type: Number, default: null },
    changeSummary: { type: String, default: null, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

BlogPostRevisionSchema.index({ postId: 1, version: -1 }, { unique: true });
BlogPostRevisionSchema.index({ postId: 1, createdAt: -1 });
BlogPostRevisionSchema.index({ slug: 1, createdAt: -1 });

export default mongoose.models.BlogPostRevision ||
  mongoose.model<IBlogPostRevision>(
    "BlogPostRevision",
    BlogPostRevisionSchema,
  );
