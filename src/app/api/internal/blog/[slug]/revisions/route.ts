/**
 * GET /api/internal/blog/[slug]/revisions - Author access to blog revision history
 */

import { NextRequest } from "next/server";

import { canEditBlogDraft } from "@/lib/access/blog";
import {
  err as appError,
  ok,
  parseRouteParams,
} from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { slugParamsSchema } from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth";
import {
  getPostRevisionByVersion,
  getPostRevisionSummaries,
} from "@/lib/blog/revisions";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

type RouteContext = { params: Promise<{ slug: string }> };

async function getAuthorizedPost(request: NextRequest, slug: string) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return appError("UNAUTHENTICATED", "Unauthorized");

  await dbConnect();
  const post = await BlogPost.findOne({ slug });
  if (!post) return appError("NOT_FOUND", "Post not found.");

  const user = session.user;
  if (!canEditBlogDraft(user, post)) {
    return appError("FORBIDDEN", "Forbidden");
  }

  return ok({ post, user });
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      slugParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug } = validatedParams.data;

    const authResult = await getAuthorizedPost(request, slug);
    if (!authResult.ok) return jsonResult(authResult);
    const { post } = authResult.data;

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
    logger.error("Internal blog revisions lookup failed", {
      route: "GET /api/internal/blog/[slug]/revisions",
      operation: "list_revisions",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
