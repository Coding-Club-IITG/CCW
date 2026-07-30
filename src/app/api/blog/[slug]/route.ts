/**
 * GET /api/blog/[slug] - Get a single published blog post (public)
 */

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { slug } = await context.params;

    await dbConnect();
    const post = await BlogPost.findOne({ slug, status: "published" }).lean();

    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (err) {
    logger.error("Published blog lookup failed", {
      route: "GET /api/blog/[slug]",
      operation: "get_post",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
