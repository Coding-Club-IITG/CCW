/**
 * POST /api/internal/blog/[slug]/revisions/[version]/restore - Author load earlier version into draft staging
 */

import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { z } from "zod";

import { canEditBlogDraft } from "@/lib/access/blog";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeBlogRevision } from "@/lib/audit/summary";
import {
  err as appError,
  ok,
  parseRouteParams,
} from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auth } from "@/lib/auth";
import { getPostRevisionByVersion } from "@/lib/blog/revisions";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

const restoreParamsSchema = z.object({
  slug: z.string().trim().min(1),
  version: z.coerce.number().int().min(1),
});

type RouteContext = { params: Promise<{ slug: string; version: string }> };

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

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      restoreParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug, version: targetVersion } = validatedParams.data;

    const authResult = await getAuthorizedDraft(request, slug);
    if (!authResult.ok) return jsonResult(authResult);
    const { post, user } = authResult.data;

    if (post.status !== "published") {
      return jsonError(
        "CONFLICT",
        "Only published posts can have revisions restored.",
      );
    }

    const historicalRev = await getPostRevisionByVersion(post, targetVersion);
    if (!historicalRev) {
      return jsonError(
        "NOT_FOUND",
        `Revision version ${targetVersion} not found.`,
      );
    }

    const dbSession = await mongoose.startSession();
    let saved;

    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const currentQuery = BlogPost.findOne({ slug });
        if (transaction) currentQuery.session(transaction);
        const current = await currentQuery;
        if (!current) throw new Error("Blog post not found.");

        const existingRev =
          current.pendingRevision?.toObject?.() || current.pendingRevision;

        const stagedRevision = {
          title: historicalRev.title,
          content: historicalRev.content,
          excerpt: historicalRev.excerpt,
          coverImage: historicalRev.coverImage,
          coverFocalPoint: historicalRev.coverFocalPoint,
          tags: historicalRev.tags,
          baseUpdatedAt: current.updatedAt,
          updatedAt: new Date(),
          submittedAt: null,
          submittedBy: new mongoose.Types.ObjectId(String(user.id)),
        };

        current.set({ pendingRevision: stagedRevision });
        await current.save({
          ...(transaction ? { session: transaction } : {}),
          timestamps: false,
        });

        return {
          result: current,
          audit: {
            actor: auditActor(user),
            category: "blog" as const,
            action: existingRev ? ("update" as const) : ("create" as const),
            operation: "blog.revision.draft_restore",
            target: {
              type: "blog-revision",
              id: String(current._id),
              label: stagedRevision.title,
            },
            before: summarizeBlogRevision(
              existingRev as unknown as Record<string, unknown> | null,
            ),
            after: summarizeBlogRevision(stagedRevision),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    return jsonOk({ post: saved.toObject() });
  } catch (err: unknown) {
    logger.error("Author blog draft restore failed", {
      route: "POST /api/internal/blog/[slug]/revisions/[version]/restore",
      operation: "draft_restore_revision",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
