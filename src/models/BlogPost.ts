import mongoose, { Schema, Document, Types } from "mongoose";
import { BLOG_STATUSES, BLOG_TAGS } from "@/lib/constants";
import type { BlogStatus, BlogTag } from "@/lib/constants";

export interface IBlogPost extends Document {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  coverImage: string;
  author: Types.ObjectId;
  authorName: string;
  tags: BlogTag[];
  status: BlogStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BlogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, trim: true },
    content: { type: String, default: "" },
    excerpt: { type: String, default: "", maxlength: 500 },
    coverImage: { type: String, default: "" },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorName: { type: String, required: true },
    tags: [{ type: String, enum: BLOG_TAGS }],
    status: { type: String, enum: BLOG_STATUSES, default: "draft" },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

BlogPostSchema.index({ status: 1, publishedAt: -1 });
BlogPostSchema.index({ tags: 1, status: 1, publishedAt: -1 });

export default mongoose.models.BlogPost ||
  mongoose.model<IBlogPost>("BlogPost", BlogPostSchema);
