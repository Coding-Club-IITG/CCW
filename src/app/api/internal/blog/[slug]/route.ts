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
import { DEFAULT_TAG_MAX_LENGTH, normalizeTags } from "@/lib/tagUtils";
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
    const isPublished = post.status === "published";
    const user = result.data.user;

    // Validate incoming fields
    let newTitle: string | undefined = undefined;
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title || title.length > 200) {
        return jsonError("VALIDATION_ERROR", "Title must be 1-200 characters.");
      }
      newTitle = title;
    }

    let newContent: string | undefined = undefined;
    if (body.content !== undefined) {
      newContent = String(body.content);
    }

    let newExcerpt: string | undefined = undefined;
    if (body.excerpt !== undefined) {
      const excerpt = String(body.excerpt).trim();
      if (excerpt.length > 500) {
        return jsonError(
          "VALIDATION_ERROR",
          "Excerpt must be 500 characters or fewer.",
        );
      }
      newExcerpt = excerpt;
    }

    let newCoverImage: string | undefined = undefined;
    if (body.coverImage !== undefined) {
      newCoverImage = String(body.coverImage);
    }

    let newCoverFocalPoint = undefined;
    if (body.coverFocalPoint !== undefined) {
      newCoverFocalPoint = parseImageFocalPoint(body.coverFocalPoint);
    }

    let newTags: string[] | undefined = undefined;
    if (body.tags !== undefined && Array.isArray(body.tags)) {
      newTags = normalizeTags(body.tags).filter(
        (tag) => tag.length <= DEFAULT_TAG_MAX_LENGTH,
      );
    }

    const requestApproval = Boolean(body.requestApproval);
    const cancelApproval = Boolean(body.cancelApproval);

    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) throw new Error("Blog post disappeared during update.");
        const before = current.toObject();

        if (isPublished) {
          // Staged revision workflow for published posts
          const existingRev = current.pendingRevision?.toObject?.() || current.pendingRevision;
          const currentBase = existingRev || current;

          let submittedAt = existingRev?.submittedAt || null;
          if (requestApproval) {
            submittedAt = new Date();
          } else if (cancelApproval) {
            submittedAt = null;
          }

          const updatedRevision = {
            title: newTitle !== undefined ? newTitle : currentBase.title,
            content: newContent !== undefined ? newContent : currentBase.content,
            excerpt: newExcerpt !== undefined ? newExcerpt : currentBase.excerpt,
            coverImage: newCoverImage !== undefined ? newCoverImage : currentBase.coverImage,
            coverFocalPoint: newCoverFocalPoint !== undefined ? newCoverFocalPoint : currentBase.coverFocalPoint,
            tags: newTags !== undefined ? newTags : currentBase.tags,
            updatedAt: new Date(),
            submittedAt,
            submittedBy: new mongoose.Types.ObjectId(String(user.id)),
          };

          current.set({ pendingRevision: updatedRevision });
          await current.save({ session: transaction });

          return {
            result: current,
            audit: {
              actor: auditActor(user),
              category: "blog" as const,
              action: "update" as const,
              operation: requestApproval
                ? "blog.revision.submit"
                : cancelApproval
                  ? "blog.revision.withdraw"
                  : "blog.revision.update",
              target: {
                type: "blog-post",
                id: String(current._id),
                label: current.title,
              },
              before: summarizePublicContent(before as unknown as Record<string, unknown>),
              after: summarizePublicContent({
                ...before,
                ...updatedRevision,
              } as unknown as Record<string, unknown>),
            },
          };
        } else {
          // Standard draft workflow
          current.set({
            title: newTitle !== undefined ? newTitle : current.title,
            content: newContent !== undefined ? newContent : current.content,
            excerpt: newExcerpt !== undefined ? newExcerpt : current.excerpt,
            coverImage: newCoverImage !== undefined ? newCoverImage : current.coverImage,
            coverFocalPoint: newCoverFocalPoint !== undefined ? newCoverFocalPoint : current.coverFocalPoint,
            tags: newTags !== undefined ? newTags : current.tags,
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
              before: summarizePublicContent(before as unknown as Record<string, unknown>),
              after: summarizePublicContent(current.toObject() as unknown as Record<string, unknown>),
            },
          };
        }
      });
    } finally {
      await dbSession.endSession();
    }

    if (!isPublished) {
      await invalidateCache("blog");
    }
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      slugParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug } = validatedParams.data;
    const result = await getAuthorizedDraft(request, slug);
    if (!result.ok) return jsonResult(result);

    const post = result.data.post;
    if (post.status !== "published" || !post.pendingRevision) {
      return jsonError("VALIDATION_ERROR", "No pending revision to discard.");
    }

    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) throw new Error("Blog post disappeared during revision discard.");
        const before = current.toObject();
        current.set({ pendingRevision: null });
        await current.save({ session: transaction });

        return {
          result: current,
          audit: {
            actor: auditActor(result.data.user),
            category: "blog" as const,
            action: "delete" as const,
            operation: "blog.revision.discard",
            target: {
              type: "blog-post",
              id: String(current._id),
              label: current.title,
            },
            before: summarizePublicContent(before as unknown as Record<string, unknown>),
            after: summarizePublicContent(current.toObject() as unknown as Record<string, unknown>),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    await invalidateCache("admin:blog");
    return jsonOk({ post: saved.toObject() });
  } catch (err) {
    logger.error("Internal blog revision discard failed", {
      route: "DELETE /api/internal/blog/[slug]",
      operation: "discard_revision",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

