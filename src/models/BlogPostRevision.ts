import mongoose, { Schema, type Document, type Model, Types } from "mongoose";

import type { BlogContent, BlogPerson } from "@/lib/blog/types";
import {
  BLOG_REVISION_SOURCES,
  BLOG_REVISION_SUMMARY_MAX_LENGTH,
  type BlogRevisionSource,
} from "@/lib/constants";

export interface IBlogPostRevision
  extends Document<Types.ObjectId>, BlogContent {
  postId: Types.ObjectId;
  slug: string;
  version: number;
  authors: BlogPerson<Types.ObjectId>[];
  editor: BlogPerson<Types.ObjectId>;
  approvedBy: BlogPerson<Types.ObjectId> | null;
  source: BlogRevisionSource;
  restoredFromVersion: number | null;
  changeSummary: string | null;
  createdAt: Date;
}

const RevisionPersonSchema = new Schema<BlogPerson<Types.ObjectId>>(
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
    authors: { type: [RevisionPersonSchema], default: [] },
    editor: { type: RevisionPersonSchema, required: true },
    approvedBy: { type: RevisionPersonSchema, default: null },
    source: {
      type: String,
      enum: BLOG_REVISION_SOURCES,
      required: true,
    },
    restoredFromVersion: { type: Number, default: null },
    changeSummary: {
      type: String,
      default: null,
      maxlength: BLOG_REVISION_SUMMARY_MAX_LENGTH,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false, versionKey: false },
);

BlogPostRevisionSchema.index({ postId: 1, version: -1 }, { unique: true });
BlogPostRevisionSchema.index({ postId: 1, createdAt: -1 });
BlogPostRevisionSchema.index({ slug: 1, createdAt: -1 });

export default (mongoose.models.BlogPostRevision as
  Model<IBlogPostRevision> | undefined) ||
  mongoose.model<IBlogPostRevision>("BlogPostRevision", BlogPostRevisionSchema);
