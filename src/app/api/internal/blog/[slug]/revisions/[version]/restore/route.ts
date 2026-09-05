/**
 * POST /api/internal/blog/[slug]/revisions/[version]/restore - Author load earlier version into draft staging
 */

import mongoose from "mongoose";
import { NextRequest } from "next/server";

import { canEditBlogDraft } from "@/lib/access/blog";
import { auditActor, auditedTransaction } from "@/lib/audit";
import {
  summarizeBlogRevision,
  summarizePublicContent,
} from "@/lib/audit/summary";
import { parseRouteParams, type AppErrorCode } from "@/lib/api/result";
import { requireBlogEditor } from "@/lib/blog/access";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { blogRevisionParamsSchema } from "@/lib/blog/schemas";
import { invalidateCache } from "@/lib/cache";
import { getPostRevisionByVersion } from "@/lib/blog/revisions";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

type RouteContext = { params: Promise<{ slug: string; version: string }> };

class BlogRouteError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      blogRevisionParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug, version: targetVersion } = validatedParams.data;

    const authResult = await requireBlogEditor(request, slug);
    if (!authResult.ok) return jsonResult(authResult);
    const { user } = authResult.data;

    const dbSession = await mongoose.startSession();
    let saved;

    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) {
          throw new BlogRouteError("NOT_FOUND", "Blog post not found.");
        }
        if (!canEditBlogDraft(user, current)) {
          throw new BlogRouteError("FORBIDDEN", "Forbidden");
        }

        const existingRev =
          current.pendingRevision?.toObject?.() || current.pendingRevision;

        if (existingRev?.submittedAt) {
          throw new BlogRouteError(
            "CONFLICT",
            "Withdraw the review request before restoring a revision into draft staging.",
          );
        }

        const historicalRev = await getPostRevisionByVersion(
          current,
          targetVersion,
        );
        if (!historicalRev) {
          throw new BlogRouteError(
            "NOT_FOUND",
            `Revision version ${targetVersion} not found.`,
          );
        }

        if (current.status === "published") {
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
            session: transaction,
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
        } else {
          const before = current.toObject();
          current.set({
            title: historicalRev.title,
            content: historicalRev.content,
            excerpt: historicalRev.excerpt,
            coverImage: historicalRev.coverImage,
            coverFocalPoint: historicalRev.coverFocalPoint,
            tags: historicalRev.tags,
          });
          await current.save({ session: transaction });

          return {
            result: current,
            audit: {
              actor: auditActor(user),
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
        }
      });
    } finally {
      await dbSession.endSession();
    }

    if (saved.status !== "published") {
      await invalidateCache("blog");
    }
    await invalidateCache("admin:blog");
    return jsonOk({ post: saved.toObject() });
  } catch (err: unknown) {
    if (err instanceof BlogRouteError) {
      return jsonError(err.code, err.message);
    }
    logger.error("Author blog draft restore failed", {
      route: "POST /api/internal/blog/[slug]/revisions/[version]/restore",
      operation: "draft_restore_revision",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
