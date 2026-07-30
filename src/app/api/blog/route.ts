/**
 * GET /api/blog - List published blog posts (public)
 */

import { NextRequest, NextResponse } from "next/server";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { paginatedResponse, parsePagination } from "@/lib/pagination";
import { prepareSearchQuery } from "@/lib/search";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 12 });
    const tag = searchParams.get("tag")?.trim() || null;
    const searchQuery = prepareSearchQuery(searchParams.get("search"));

    const cacheKey = buildCacheKey("blog", {
      page,
      limit,
      tag: tag || undefined,
      search: searchQuery?.query,
    });

    const result = await cachedFetch(cacheKey, CACHE_TTLS.BLOG, async () => {
      const filter: Record<string, any> = { status: "published" };
      if (tag) {
        filter.tags = tag;
      }
      if (searchQuery) {
        filter.title = { $regex: searchQuery.pattern, $options: "i" };
      }

      const [posts, total, availableTags] = await Promise.all([
        BlogPost.find(filter)
          .select(
            "title slug excerpt coverImage authors tags publishedAt updatedAt",
          )
          .sort({ publishedAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        BlogPost.countDocuments(filter),
        BlogPost.distinct("tags", { status: "published" }),
      ]);

      return { posts, total, availableTags };
    });

    return NextResponse.json({
      ...paginatedResponse(result.posts, result.total, page, limit),
      availableTags: result.availableTags,
    });
  } catch (err) {
    logger.error("Published blog listing failed", {
      route: "GET /api/blog",
      operation: "list_posts",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
