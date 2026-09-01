/**
 * GET  /api/admin/blog - List all posts (admin only)
 * POST /api/admin/blog - Create a new blog post (admin only)
 */

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { z } from "zod";

import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizePublicContent } from "@/lib/audit/summary";
import { requireHead } from "@/lib/api/auth";
import { parseJson, parseSearchParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  jsonObjectSchema,
  paginationQueryFields,
} from "@/lib/api/schemas/boundary";
import {
  CACHE_TTLS,
  buildCacheKey,
  cachedFetch,
  invalidateCache,
} from "@/lib/cache";
import { BLOG_STATUSES, type BlogStatus } from "@/lib/constants";
import { parseImageFocalPoint } from "@/lib/imageFocalPoint";
import dbConnect from "@/lib/mongodb";
import { DEFAULT_TAG_MAX_LENGTH, normalizeTags } from "@/lib/tagUtils";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { findUniqueSlug, titleToSlug } from "@/lib/slug";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

async function uniqueSlug(base: string): Promise<string> {
  return findUniqueSlug(base, async (slug) =>
    Boolean(await BlogPost.exists({ slug })),
  );
}

// GET /api/admin/blog
export async function GET(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const user = authorization.data.user;

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(
      searchParams,
      z.object({
        ...paginationQueryFields,
        status: z.enum(BLOG_STATUSES).optional(),
      }),
    );
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 20 });
    const status: BlogStatus | undefined = query.data.status;

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

    return jsonOk(paginatedResponse(result.posts, result.total, page, limit));
  } catch (err) {
    logger.error("Admin blog listing failed", {
      route: "GET /api/admin/blog",
      operation: "list_posts",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

// POST /api/admin/blog
export async function POST(request: NextRequest) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const user = authorization.data.user;

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    const {
      title,
      content,
      excerpt,
      coverImage,
      coverFocalPoint,
      tags,
      status,
    } = body;

    // Validate title
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return jsonError("VALIDATION_ERROR", "Title is required.");
    }
    if (title.trim().length > 200) {
      return jsonError(
        "VALIDATION_ERROR",
        "Title must be 200 characters or fewer.",
      );
    }

    // Validate excerpt
    if (excerpt && typeof excerpt === "string" && excerpt.length > 500) {
      return jsonError(
        "VALIDATION_ERROR",
        "Excerpt must be 500 characters or fewer.",
      );
    }

    // Validate tags
    const validTags = Array.isArray(tags)
      ? normalizeTags(tags).filter(
          (tag) => tag.length <= DEFAULT_TAG_MAX_LENGTH,
        )
      : [];

    // Validate status
    const postStatus: BlogStatus =
      status && BLOG_STATUSES.includes(status as BlogStatus)
        ? (status as BlogStatus)
        : "draft";

    await dbConnect();

    const slug = await uniqueSlug(titleToSlug(title.trim()));

    const dbSession = await mongoose.startSession();
    let post;
    try {
      post = await auditedTransaction(dbSession, async (transaction) => {
        const [created] = await BlogPost.create(
          [
            {
              title: title.trim(),
              slug,
              content: typeof content === "string" ? content : "",
              excerpt: typeof excerpt === "string" ? excerpt.trim() : "",
              coverImage: typeof coverImage === "string" ? coverImage : "",
              coverFocalPoint: parseImageFocalPoint(coverFocalPoint),
              authors: [{ userId: user.id, name: user.name || "Unknown" }],
              tags: validTags,
              status: postStatus,
              publishedAt: postStatus === "published" ? new Date() : null,
            },
          ],
          { session: transaction },
        );
        return {
          result: created,
          audit: {
            actor: auditActor(user),
            category: "blog" as const,
            action: "create" as const,
            operation: "blog.create",
            target: {
              type: "blog-post",
              id: String(created._id),
              label: created.title,
            },
            after: summarizePublicContent(
              created.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    await invalidateCache("blog");
    await invalidateCache("admin:blog");
    await invalidateCache("home");
    revalidatePath("/");
    revalidatePath("/sitemap.xml");

    return jsonOk({ post }, { status: 201 });
  } catch (err) {
    logger.error("Admin blog creation failed", {
      route: "POST /api/admin/blog",
      operation: "create_post",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
