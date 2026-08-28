import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { canEditBlogDraft } from "@/lib/access/blog";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizePublicContent } from "@/lib/audit/summary";
import {
  err as appError,
  ok,
  parseJson,
  parseRouteParams,
} from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { jsonObjectSchema, slugParamsSchema } from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";
import { parseImageFocalPoint } from "@/lib/imageFocalPoint";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

type RouteContext = { params: Promise<{ slug: string }> };

async function getAuthorizedDraft(request: NextRequest, slug: string) {
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
    const result = await getAuthorizedDraft(request, slug);
    if (!result.ok) return jsonResult(result);

    return jsonOk({ post: result.data.post.toObject() });
  } catch (err) {
    logger.error("Internal blog lookup failed", {
      route: "GET /api/internal/blog/[slug]",
      operation: "get_draft",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      slugParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug } = validatedParams.data;
    const result = await getAuthorizedDraft(request, slug);
    if (!result.ok) return jsonResult(result);

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    const post = result.data.post;

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title || title.length > 200) {
        return jsonError("VALIDATION_ERROR", "Title must be 1-200 characters.");
      }
      post.title = title;
    }

    if (body.content !== undefined) {
      post.content = String(body.content);
    }

    if (body.excerpt !== undefined) {
      const excerpt = String(body.excerpt).trim();
      if (excerpt.length > 500) {
        return jsonError(
          "VALIDATION_ERROR",
          "Excerpt must be 500 characters or fewer.",
        );
      }
      post.excerpt = excerpt;
    }

    if (body.coverImage !== undefined) {
      post.coverImage = String(body.coverImage);
    }

    if (body.coverFocalPoint !== undefined) {
      post.coverFocalPoint = parseImageFocalPoint(body.coverFocalPoint);
    }

    if (body.tags !== undefined && Array.isArray(body.tags)) {
      post.tags = body.tags
        .filter(
          (tag): tag is string =>
            typeof tag === "string" &&
            tag.trim().length > 0 &&
            tag.trim().length <= 50,
        )
        .map((tag) => tag.trim());
    }

    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) throw new Error("Blog draft disappeared during update.");
        const before = current.toObject();
        current.set({
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
          coverImage: post.coverImage,
          coverFocalPoint: post.coverFocalPoint,
          tags: post.tags,
        });
        await current.save({ session: transaction });
        return {
          result: current,
          audit: {
            actor: auditActor(result.data.user),
            category: "blog" as const,
            action: "update" as const,
            operation: "blog.draft.update",
            target: {
              type: "blog-post",
              id: String(current._id),
              label: current.title,
            },
            before: summarizePublicContent(
              before as unknown as Record<string, unknown>,
            ),
            after: summarizePublicContent(
              current.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    await invalidateCache("blog");
    await invalidateCache("admin:blog");

    return jsonOk({ post: saved.toObject() });
  } catch (err) {
    logger.error("Internal blog update failed", {
      route: "PATCH /api/internal/blog/[slug]",
      operation: "update_draft",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
