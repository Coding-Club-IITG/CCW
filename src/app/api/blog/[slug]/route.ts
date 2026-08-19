/**
 * GET /api/blog/[slug] - Get a single published blog post (public)
 */

import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { parseRouteParams } from "@/lib/api/result";
import { slugParamsSchema } from "@/lib/api/schemas/boundary";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      slugParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug } = validatedParams.data;

    await dbConnect();
    const post = await BlogPost.findOne({ slug, status: "published" }).lean();

    if (!post) {
      return jsonError("NOT_FOUND", "Post not found.");
    }

    return jsonOk({ post });
  } catch (err) {
    logger.error("Published blog lookup failed", {
      route: "GET /api/blog/[slug]",
      operation: "get_post",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
