/**
 * GET /api/admin/blog/[slug]/revisions - List revision history or get a specific revision (admin only)
 */

import { NextRequest } from "next/server";

import { requireHead } from "@/lib/api/auth";
import { parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { slugParamsSchema } from "@/lib/api/schemas/boundary";
import {
  getPostRevisionByVersion,
  getPostRevisionSummaries,
} from "@/lib/blog/revisions";
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

    const { searchParams } = new URL(request.url);
    const versionParam = searchParams.get("version");

    if (versionParam !== null) {
      const version = parseInt(versionParam, 10);
      if (isNaN(version) || version < 1) {
        return jsonError("VALIDATION_ERROR", "Invalid version number.");
      }
      const revision = await getPostRevisionByVersion(post, version);
      if (!revision) {
        return jsonError("NOT_FOUND", "Revision not found.");
      }
      return jsonOk({ revision });
    }

    const revisions = await getPostRevisionSummaries(post);
    return jsonOk({ revisions });
  } catch (err) {
    logger.error("Admin blog revisions lookup failed", {
      route: "GET /api/admin/blog/[slug]/revisions",
      operation: "list_revisions",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
