/**
 * GET /api/internal/blog/[slug]/revisions - Author access to blog revision history
 */

import { NextRequest } from "next/server";

import { parseRouteParams } from "@/lib/api/result";
import { requireBlogEditor } from "@/lib/blog/access";
import { jsonError, jsonResult } from "@/lib/api/result.server";
import { slugParamsSchema } from "@/lib/api/schemas/boundary";
import { readPostRevisions } from "@/lib/blog/revisions";
import { errorToLogMetadata, logger } from "@/lib/utils";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      slugParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug } = validatedParams.data;

    const authResult = await requireBlogEditor(request, slug);
    if (!authResult.ok) return jsonResult(authResult);
    const { post } = authResult.data;

    return jsonResult(
      await readPostRevisions(post, request.nextUrl.searchParams),
    );
  } catch (err) {
    logger.error("Internal blog revisions lookup failed", {
      route: "GET /api/internal/blog/[slug]/revisions",
      operation: "list_revisions",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
