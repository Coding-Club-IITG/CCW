/**
 * GET /api/blog - List published blog posts (public)
 */

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import BlogPost from "@/models/BlogPost";
import { BLOG_TAGS, type BlogTag } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("limit") || "12", 10)),
    );
    const tag = searchParams.get("tag") as BlogTag | null;

    const filter: Record<string, any> = { status: "published" };
    if (tag && BLOG_TAGS.includes(tag as BlogTag)) {
      filter.tags = tag;
    }

    const [posts, total, availableTags] = await Promise.all([
      BlogPost.find(filter)
        .select(
          "title slug excerpt coverImage authors tags publishedAt updatedAt",
        )
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      BlogPost.countDocuments(filter),
      BlogPost.distinct("tags", { status: "published" }),
    ]);

    return NextResponse.json({
      posts,
      availableTags,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[Blog] GET /api/blog error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
