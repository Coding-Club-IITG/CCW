/**
 * GET /api/admin/blog/[slug]/revisions - List revision history or get a specific revision (admin only)
 */

import { NextRequest } from "next/server";

import { requireHead } from "@/lib/api/auth";
import { parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonResult } from "@/lib/api/result.server";
import { slugParamsSchema } from "@/lib/api/schemas/boundary";
import { readPostRevisions } from "@/lib/blog/revisions";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);

    const validatedParams = parseRouteParams(
      await context.params,
      slugParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug } = validatedParams.data;

    await dbConnect();
    const post = await BlogPost.findOne({ slug });
    if (!post) {
      return jsonError("NOT_FOUND", "Blog post not found.");
    }

    return jsonResult(
      await readPostRevisions(post, request.nextUrl.searchParams),
    );
  } catch (err) {
    logger.error("Admin blog revisions lookup failed", {
      route: "GET /api/admin/blog/[slug]/revisions",
      operation: "list_revisions",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
