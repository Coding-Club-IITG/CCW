/**
 * GET  /api/admin/blog - List all posts (admin only)
 * POST /api/admin/blog - Create a new blog post (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import dbConnect from "@/lib/mongodb";
import { BLOG_STATUSES, type BlogStatus } from "@/lib/constants";
import {
  cachedFetch,
  buildCacheKey,
  CACHE_TTLS,
  invalidateCache,
} from "@/lib/cache";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let counter = 1;
  while (await BlogPost.exists({ slug })) {
    slug = `${base}-${++counter}`;
  }
  return slug;
}

// GET /api/admin/blog
export async function GET(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });
    const status = searchParams.get("status") as BlogStatus | null;

    const filter: Record<string, any> = {};
    if (status && BLOG_STATUSES.includes(status as BlogStatus)) {
      filter.status = status;
    }

    const cacheKey = buildCacheKey("admin:blog", {
      page,
      limit,
      status: status || undefined,
    });

    const result = await cachedFetch(cacheKey, CACHE_TTLS.BLOG, async () => {
      const [posts, total] = await Promise.all([
        BlogPost.find(filter)
          .select(
            "title slug excerpt tags status publishedAt createdAt updatedAt authors",
          )
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        BlogPost.countDocuments(filter),
      ]);
      return { posts, total };
    });

    return NextResponse.json(
      paginatedResponse(result.posts, result.total, page, limit),
    );
  } catch (err) {
    logger.error("Admin blog listing failed", {
      route: "GET /api/admin/blog",
      operation: "list_posts",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// POST /api/admin/blog
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const { title, content, excerpt, coverImage, tags, status } = body;

    // Validate title
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Title is required." },
        { status: 400 },
      );
    }
    if (title.trim().length > 200) {
      return NextResponse.json(
        { error: "Title must be 200 characters or fewer." },
        { status: 400 },
      );
    }

    // Validate excerpt
    if (excerpt && typeof excerpt === "string" && excerpt.length > 500) {
      return NextResponse.json(
        { error: "Excerpt must be 500 characters or fewer." },
        { status: 400 },
      );
    }

    // Validate tags
    const validTags: string[] = [];
    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (
          typeof t === "string" &&
          t.trim().length > 0 &&
          t.trim().length <= 50
        ) {
          validTags.push(t.trim());
        }
      }
    }

    // Validate status
    const postStatus: BlogStatus =
      status && BLOG_STATUSES.includes(status as BlogStatus)
        ? (status as BlogStatus)
        : "draft";

    await dbConnect();

    const slug = await uniqueSlug(generateSlug(title.trim()));

    const post = await BlogPost.create({
      title: title.trim(),
      slug,
      content: content || "",
      excerpt: (excerpt || "").trim(),
      coverImage: coverImage || "",
      authors: [{ userId: user.id, name: user.name || "Unknown" }],
      tags: validTags,
      status: postStatus,
      publishedAt: postStatus === "published" ? new Date() : null,
    });

    await invalidateCache("blog");
    await invalidateCache("admin:blog");

    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    logger.error("Admin blog creation failed", {
      route: "POST /api/admin/blog",
      operation: "create_post",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
