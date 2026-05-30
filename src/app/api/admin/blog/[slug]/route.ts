/**
 * GET    /api/admin/blog/[slug] - Get post for editing (admin only)
 * PATCH  /api/admin/blog/[slug] - Update a blog post (admin only)
 * DELETE /api/admin/blog/[slug] - Delete a blog post (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import {
  BLOG_TAGS,
  BLOG_STATUSES,
  type BlogTag,
  type BlogStatus,
} from "@/lib/constants";

type RouteContext = { params: Promise<{ slug: string }> };

async function requireAdmin(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const user = session.user as any;
  if (!isAdmin(user.role)) return null;
  return user;
}

// GET /api/admin/blog/[slug]
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = await context.params;
    await dbConnect();

    const post = await BlogPost.findOne({ slug }).lean();
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (err) {
    console.error("[Blog Admin] GET [slug] error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// PATCH /api/admin/blog/[slug]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = await context.params;
    await dbConnect();

    const post = await BlogPost.findOne({ slug });
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
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

    // Updatable fields
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title || title.length > 200) {
        return NextResponse.json(
          { error: "Title must be 1-200 characters." },
          { status: 400 },
        );
      }
      post.title = title;
    }

    if (body.content !== undefined) {
      post.content = String(body.content);
    }

    if (body.excerpt !== undefined) {
      const excerpt = String(body.excerpt).trim();
      if (excerpt.length > 500) {
        return NextResponse.json(
          { error: "Excerpt must be 500 characters or fewer." },
          { status: 400 },
        );
      }
      post.excerpt = excerpt;
    }

    if (body.coverImage !== undefined) {
      post.coverImage = String(body.coverImage);
    }

    if (body.tags !== undefined) {
      if (Array.isArray(body.tags)) {
        post.tags = body.tags.filter((t: string) =>
          BLOG_TAGS.includes(t as BlogTag),
        ) as BlogTag[];
      }
    }

    // Update authors list if provided
    if (body.authors !== undefined && Array.isArray(body.authors)) {
      post.authors = body.authors
        .filter((a: any) => a.userId && a.name)
        .map((a: any) => ({ userId: a.userId, name: String(a.name) }));
    }

    // Auto-add current editor to authors if not already present
    const editorExists = post.authors.some(
      (a: any) => String(a.userId) === String(user.id),
    );
    if (!editorExists) {
      post.authors.push({ userId: user.id, name: user.name || "Unknown" });
    }

    if (body.status !== undefined) {
      if (BLOG_STATUSES.includes(body.status as BlogStatus)) {
        const newStatus = body.status as BlogStatus;
        // Set publishedAt on first publish
        if (newStatus === "published" && !post.publishedAt) {
          post.publishedAt = new Date();
        }
        post.status = newStatus;
      }
    }

    await post.save();

    return NextResponse.json({ post: post.toObject() });
  } catch (err) {
    console.error("[Blog Admin] PATCH [slug] error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// DELETE /api/admin/blog/[slug]
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAdmin(request);
    if (!user) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { slug } = await context.params;
    await dbConnect();

    const result = await BlogPost.findOneAndDelete({ slug });
    if (!result) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Blog Admin] DELETE [slug] error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
