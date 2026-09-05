import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { z } from "zod";

import { canEditBlogDraft } from "@/lib/access/blog";
import { auditActor, auditedTransaction } from "@/lib/audit";
import {
  summarizeBlogRevision,
  summarizePublicContent,
} from "@/lib/audit/summary";
import {
  parseJson,
  parseRouteParams,
  type AppErrorCode,
} from "@/lib/api/result";
import { requireBlogEditor } from "@/lib/blog/access";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { slugParamsSchema } from "@/lib/api/schemas/boundary";
import { invalidateCache } from "@/lib/cache";
import { DEFAULT_TAG_MAX_LENGTH, normalizeTags } from "@/lib/tagUtils";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

type RouteContext = { params: Promise<{ slug: string }> };

const editableRevisionFields = [
  "title",
  "content",
  "excerpt",
  "coverImage",
  "coverFocalPoint",
  "tags",
] as const;

const memberBlogPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().optional(),
    excerpt: z.string().trim().max(500).optional(),
    coverImage: z.string().optional(),
    coverFocalPoint: z
      .object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      })
      .strict()
      .optional(),
    tags: z.array(z.string()).optional(),
    requestApproval: z.boolean().optional().default(false),
    cancelApproval: z.boolean().optional().default(false),
  })
  .strict()
  .superRefine((input, context) => {
    const hasEditableFields = editableRevisionFields.some(
      (field) => input[field] !== undefined,
    );
    if (!hasEditableFields && !input.requestApproval && !input.cancelApproval) {
      context.addIssue({
        code: "custom",
        message: "At least one editable field or revision action is required.",
      });
    }
    if (input.requestApproval && input.cancelApproval) {
      context.addIssue({
        code: "custom",
        message: "Approval cannot be requested and withdrawn together.",
      });
    }
    if (input.cancelApproval && hasEditableFields) {
      context.addIssue({
        code: "custom",
        message: "Withdraw the review request before editing the revision.",
      });
    }
    const normalizedTags =
      input.tags === undefined ? [] : normalizeTags(input.tags);
    if (normalizedTags.some((tag) => tag.length > DEFAULT_TAG_MAX_LENGTH)) {
      context.addIssue({
        code: "custom",
        path: ["tags"],
        message: `Each tag must be ${DEFAULT_TAG_MAX_LENGTH} characters or fewer.`,
      });
    }
  });

class BlogRouteError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      slugParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug } = validatedParams.data;
    const result = await requireBlogEditor(request, slug);
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
    const result = await requireBlogEditor(request, slug);
    if (!result.ok) return jsonResult(result);

    const parsedBody = await parseJson(request, memberBlogPatchSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    const user = result.data.user;
    const newTags =
      body.tags === undefined ? undefined : normalizeTags(body.tags);
    const { requestApproval, cancelApproval } = body;

    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) throw new BlogRouteError("NOT_FOUND", "Post not found.");
        if (!canEditBlogDraft(user, current)) {
          throw new BlogRouteError("FORBIDDEN", "Forbidden");
        }
        const before = current.toObject();

        if (current.status === "published") {
          const existingRev =
            current.pendingRevision?.toObject?.() || current.pendingRevision;
          const currentBase = existingRev || current;

          if (cancelApproval && !existingRev?.submittedAt) {
            throw new BlogRouteError(
              "CONFLICT",
              "There is no submitted revision to withdraw.",
            );
          }
          if (existingRev?.submittedAt && !cancelApproval) {
            throw new BlogRouteError(
              "CONFLICT",
              "Withdraw the review request before editing the revision.",
            );
          }

          const now = new Date();
          const updatedRevision = {
            title: body.title ?? currentBase.title,
            content: body.content ?? currentBase.content,
            excerpt: body.excerpt ?? currentBase.excerpt,
            coverImage:
              body.coverImage !== undefined
                ? body.coverImage
                : currentBase.coverImage,
            coverFocalPoint:
              body.coverFocalPoint !== undefined
                ? body.coverFocalPoint
                : currentBase.coverFocalPoint,
            tags: newTags !== undefined ? newTags : currentBase.tags,
            baseUpdatedAt: existingRev?.baseUpdatedAt ?? current.updatedAt,
            updatedAt: now,
            submittedAt: cancelApproval ? null : requestApproval ? now : null,
            submittedBy: requestApproval
              ? new mongoose.Types.ObjectId(String(user.id))
              : (existingRev?.submittedBy ??
                new mongoose.Types.ObjectId(String(user.id))),
          };

          current.set({ pendingRevision: updatedRevision });
          await current.save({ session: transaction, timestamps: false });

          return {
            result: current,
            audit: {
              actor: auditActor(user),
              category: "blog" as const,
              action: existingRev ? ("update" as const) : ("create" as const),
              operation: requestApproval
                ? "blog.revision.submit"
                : cancelApproval
                  ? "blog.revision.withdraw"
                  : "blog.revision.update",
              target: {
                type: "blog-revision",
                id: String(current._id),
                label: updatedRevision.title,
              },
              before: summarizeBlogRevision(
                existingRev as unknown as Record<string, unknown> | null,
              ),
              after: summarizeBlogRevision(updatedRevision),
            },
          };
        } else {
          if (requestApproval || cancelApproval) {
            throw new BlogRouteError(
              "CONFLICT",
              "Approval actions are only available for published posts.",
            );
          }
          current.set({
            title: body.title ?? current.title,
            content: body.content ?? current.content,
            excerpt: body.excerpt ?? current.excerpt,
            coverImage:
              body.coverImage !== undefined
                ? body.coverImage
                : current.coverImage,
            coverFocalPoint:
              body.coverFocalPoint !== undefined
                ? body.coverFocalPoint
                : current.coverFocalPoint,
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
  } catch (err) {
    if (err instanceof BlogRouteError) {
      return jsonError(err.code, err.message);
    }
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
    const result = await requireBlogEditor(request, slug);
    if (!result.ok) return jsonResult(result);

    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) throw new BlogRouteError("NOT_FOUND", "Post not found.");
        if (!canEditBlogDraft(result.data.user, current)) {
          throw new BlogRouteError("FORBIDDEN", "Forbidden");
        }
        if (current.status !== "published" || !current.pendingRevision) {
          throw new BlogRouteError(
            "CONFLICT",
            "There is no pending revision to discard.",
          );
        }
        const revision =
          current.pendingRevision.toObject?.() || current.pendingRevision;
        current.set({ pendingRevision: null });
        await current.save({ session: transaction, timestamps: false });

        return {
          result: current,
          audit: {
            actor: auditActor(result.data.user),
            category: "blog" as const,
            action: "delete" as const,
            operation: "blog.revision.discard",
            target: {
              type: "blog-revision",
              id: String(current._id),
              label: revision.title,
            },
            before: summarizeBlogRevision(
              revision as unknown as Record<string, unknown>,
            ),
            after: {},
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }

    await invalidateCache("admin:blog");
    return jsonOk({ post: saved.toObject() });
  } catch (err) {
    if (err instanceof BlogRouteError) {
      return jsonError(err.code, err.message);
    }
    logger.error("Internal blog revision discard failed", {
      route: "DELETE /api/internal/blog/[slug]",
      operation: "discard_revision",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
