import mongoose, { Schema, Document, Types } from "mongoose";
import { BLOG_STATUSES } from "@/lib/constants";
import type { BlogStatus } from "@/lib/constants";

export interface IBlogAuthor {
  userId: Types.ObjectId;
  name: string;
}

export interface IBlogPost extends Document {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  coverImage: string;
  authors: IBlogAuthor[];
  tags: string[];
  status: BlogStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BlogAuthorSchema = new Schema<IBlogAuthor>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

const BlogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, trim: true },
    content: { type: String, default: "" },
    excerpt: { type: String, default: "", maxlength: 500 },
    coverImage: { type: String, default: "" },
    authors: { type: [BlogAuthorSchema], default: [] },
    tags: [{ type: String }],
    status: { type: String, enum: BLOG_STATUSES, default: "draft" },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

BlogPostSchema.index({ status: 1, publishedAt: -1 });
BlogPostSchema.index({ tags: 1, status: 1, publishedAt: -1 });

export default mongoose.models.BlogPost ||
  mongoose.model<IBlogPost>("BlogPost", BlogPostSchema);
