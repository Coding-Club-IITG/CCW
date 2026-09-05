import mongoose, { type ClientSession, Types } from "mongoose";

import {
  DEFAULT_IMAGE_FOCAL_POINT,
  parseImageFocalPoint,
  type ImageFocalPoint,
} from "@/lib/imageFocalPoint";
import BlogPost, { type IBlogPost } from "@/models/BlogPost";
import BlogPostRevision, {
  type BlogRevisionSource,
  type IBlogPostRevision,
} from "@/models/BlogPostRevision";

export interface BlogRevisionUserDto {
  userId: string;
  name: string;
}

export interface BlogRevisionDto {
  _id: string;
  postId: string;
  slug: string;
  version: number;
  title: string;
  content: string;
  excerpt: string;
  coverImage: string;
  coverFocalPoint: ImageFocalPoint;
  tags: string[];
  authors: BlogRevisionUserDto[];
  editor: BlogRevisionUserDto;
  approvedBy: BlogRevisionUserDto | null;
  source: BlogRevisionSource;
  restoredFromVersion: number | null;
  changeSummary: string | null;
  createdAt: string;
}

export interface BlogRevisionSummaryDto {
  _id: string;
  postId: string;
  slug: string;
  version: number;
  title: string;
  excerpt: string;
  coverImage: string;
  coverFocalPoint: ImageFocalPoint;
  tags: string[];
  authors: BlogRevisionUserDto[];
  editor: BlogRevisionUserDto;
  approvedBy: BlogRevisionUserDto | null;
  source: BlogRevisionSource;
  restoredFromVersion: number | null;
  changeSummary: string | null;
  contentLength: number;
  createdAt: string;
}

export interface RecordRevisionParams {
  post: {
    _id: Types.ObjectId | string;
    slug: string;
    title: string;
    content?: string;
    excerpt?: string;
    coverImage?: string;
    coverFocalPoint?: ImageFocalPoint;
    tags?: string[];
    authors?: { userId: Types.ObjectId | string; name: string }[];
    publishedAt?: Date | null;
    createdAt?: Date;
  };
  editor: {
    userId: Types.ObjectId | string;
    name: string;
  };
  approvedBy?: {
    userId: Types.ObjectId | string;
    name: string;
  } | null;
  source: BlogRevisionSource;
  changeSummary?: string | null;
  restoredFromVersion?: number | null;
  preEditState?: {
    title: string;
    content?: string;
    excerpt?: string;
    coverImage?: string;
    coverFocalPoint?: ImageFocalPoint;
    tags?: string[];
    authors?: { userId: Types.ObjectId | string; name: string }[];
    publishedAt?: Date | null;
    createdAt?: Date;
  } | null;
}

function normalizeId(id: Types.ObjectId | string): Types.ObjectId {
  return typeof id === "string" ? new Types.ObjectId(id) : id;
}

function serializeUser(user: {
  userId: unknown;
  name: string;
}): BlogRevisionUserDto {
  return {
    userId: String(user.userId),
    name: user.name,
  };
}

export function serializeRevision(rev: any): BlogRevisionDto {
  return {
    _id: String(rev._id),
    postId: String(rev.postId),
    slug: rev.slug,
    version: rev.version,
    title: rev.title,
    content: rev.content || "",
    excerpt: rev.excerpt || "",
    coverImage: rev.coverImage || "",
    coverFocalPoint: parseImageFocalPoint(rev.coverFocalPoint),
    tags: rev.tags || [],
    authors: (rev.authors || []).map(serializeUser),
    editor: serializeUser(rev.editor),
    approvedBy: rev.approvedBy ? serializeUser(rev.approvedBy) : null,
    source: rev.source,
    restoredFromVersion: rev.restoredFromVersion ?? null,
    changeSummary: rev.changeSummary ?? null,
    createdAt:
      rev.createdAt instanceof Date
        ? rev.createdAt.toISOString()
        : new Date(rev.createdAt).toISOString(),
  };
}

export function serializeRevisionSummary(rev: any): BlogRevisionSummaryDto {
  return {
    _id: String(rev._id),
    postId: String(rev.postId),
    slug: rev.slug,
    version: rev.version,
    title: rev.title,
    excerpt: rev.excerpt || "",
    coverImage: rev.coverImage || "",
    coverFocalPoint: parseImageFocalPoint(rev.coverFocalPoint),
    tags: rev.tags || [],
    authors: (rev.authors || []).map(serializeUser),
    editor: serializeUser(rev.editor),
    approvedBy: rev.approvedBy ? serializeUser(rev.approvedBy) : null,
    source: rev.source,
    restoredFromVersion: rev.restoredFromVersion ?? null,
    changeSummary: rev.changeSummary ?? null,
    contentLength: typeof rev.content === "string" ? rev.content.length : 0,
    createdAt:
      rev.createdAt instanceof Date
        ? rev.createdAt.toISOString()
        : new Date(rev.createdAt).toISOString(),
  };
}

/**
 * Persists an immutable revision snapshot inside a MongoDB transaction session.
 * Handles legacy posts by automatically seeding Version 1 from preEditState if needed.
 */
export async function recordRevisionSnapshot(
  session: ClientSession | undefined,
  params: RecordRevisionParams,
): Promise<IBlogPostRevision> {
  const {
    post,
    editor,
    approvedBy,
    source,
    changeSummary,
    restoredFromVersion,
    preEditState,
  } = params;

  const postId = normalizeId(post._id);
  const editorObj = {
    userId: normalizeId(editor.userId),
    name: editor.name,
  };
  const approvedByObj = approvedBy
    ? {
        userId: normalizeId(approvedBy.userId),
        name: approvedBy.name,
      }
    : null;

  // Find the highest existing version for this post
  const query = BlogPostRevision.findOne({ postId }).sort({ version: -1 });
  if (session) query.session(session);
  const latest = await query.lean();

  let nextVersion = 1;

  if (latest) {
    nextVersion = latest.version + 1;
  } else if (source !== "initial_publish" && preEditState) {
    // Legacy post with no existing revisions: seed Version 1 from preEditState
    const baseAuthor =
      preEditState.authors && preEditState.authors.length > 0
        ? preEditState.authors[0]
        : post.authors && post.authors.length > 0
          ? post.authors[0]
          : editor;

    await BlogPostRevision.create(
      [
        {
          postId,
          slug: post.slug,
          version: 1,
          title: preEditState.title,
          content: preEditState.content || "",
          excerpt: preEditState.excerpt || "",
          coverImage: preEditState.coverImage || "",
          coverFocalPoint: parseImageFocalPoint(preEditState.coverFocalPoint),
          tags: preEditState.tags || [],
          authors: (preEditState.authors || post.authors || []).map((a) => ({
            userId: normalizeId(a.userId),
            name: a.name,
          })),
          editor: {
            userId: normalizeId(baseAuthor.userId),
            name: baseAuthor.name,
          },
          approvedBy: null,
          source: "initial_publish",
          restoredFromVersion: null,
          changeSummary: "Initial published version (auto-recorded)",
          createdAt:
            preEditState.publishedAt ||
            preEditState.createdAt ||
            post.publishedAt ||
            post.createdAt ||
            new Date(),
        },
      ],
      session ? { session } : undefined,
    );

    nextVersion = 2;
  }

  const [created] = await BlogPostRevision.create(
    [
      {
        postId,
        slug: post.slug,
        version: nextVersion,
        title: post.title,
        content: post.content || "",
        excerpt: post.excerpt || "",
        coverImage: post.coverImage || "",
        coverFocalPoint: parseImageFocalPoint(post.coverFocalPoint),
        tags: post.tags || [],
        authors: (post.authors || []).map((a) => ({
          userId: normalizeId(a.userId),
          name: a.name,
        })),
        editor: editorObj,
        approvedBy: approvedByObj,
        source,
        restoredFromVersion: restoredFromVersion ?? null,
        changeSummary: changeSummary ?? null,
        createdAt: new Date(),
      },
    ],
    session ? { session } : undefined,
  );

  return created;
}

/**
 * Retrieve all revisions for a blog post (metadata summaries).
 * Synthesizes Version 1 for legacy posts if none exist in the database.
 */
export async function getPostRevisionSummaries(
  post: IBlogPost,
): Promise<BlogRevisionSummaryDto[]> {
  const revisions = await BlogPostRevision.find({ postId: post._id })
    .select("-content")
    .sort({ version: -1 })
    .lean();

  if (revisions.length === 0 && post.status === "published") {
    // Synthesize Version 1 for legacy published post
    const primaryAuthor =
      post.authors && post.authors.length > 0
        ? post.authors[0]
        : { userId: new Types.ObjectId(), name: "Author" };

    return [
      {
        _id: String(post._id),
        postId: String(post._id),
        slug: post.slug,
        version: 1,
        title: post.title,
        excerpt: post.excerpt || "",
        coverImage: post.coverImage || "",
        coverFocalPoint: parseImageFocalPoint(post.coverFocalPoint),
        tags: post.tags || [],
        authors: (post.authors || []).map(serializeUser),
        editor: serializeUser(primaryAuthor),
        approvedBy: null,
        source: "initial_publish",
        restoredFromVersion: null,
        changeSummary: "Initial published version",
        contentLength: (post.content || "").length,
        createdAt: (post.publishedAt || post.createdAt || new Date()).toISOString(),
      },
    ];
  }

  return revisions.map(serializeRevisionSummary);
}

/**
 * Retrieve a specific revision with full content.
 */
export async function getPostRevisionByVersion(
  post: IBlogPost,
  version: number,
): Promise<BlogRevisionDto | null> {
  const rev = await BlogPostRevision.findOne({
    postId: post._id,
    version,
  }).lean();

  if (!rev && version === 1 && post.status === "published") {
    // Check if any other revisions exist
    const count = await BlogPostRevision.countDocuments({ postId: post._id });
    if (count === 0) {
      const primaryAuthor =
        post.authors && post.authors.length > 0
          ? post.authors[0]
          : { userId: new Types.ObjectId(), name: "Author" };

      return {
        _id: String(post._id),
        postId: String(post._id),
        slug: post.slug,
        version: 1,
        title: post.title,
        content: post.content || "",
        excerpt: post.excerpt || "",
        coverImage: post.coverImage || "",
        coverFocalPoint: parseImageFocalPoint(post.coverFocalPoint),
        tags: post.tags || [],
        authors: (post.authors || []).map(serializeUser),
        editor: serializeUser(primaryAuthor),
        approvedBy: null,
        source: "initial_publish",
        restoredFromVersion: null,
        changeSummary: "Initial published version",
        createdAt: (post.publishedAt || post.createdAt || new Date()).toISOString(),
      };
    }
  }

  return rev ? serializeRevision(rev) : null;
}
