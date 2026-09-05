/**
 * GET    /api/admin/blog/[slug] - Get post for editing (admin only)
 * PATCH  /api/admin/blog/[slug] - Update a blog post (admin only)
 * DELETE /api/admin/blog/[slug] - Delete a blog post (admin only)
 */

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";

import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizePublicContent } from "@/lib/audit/summary";
import { requireHead } from "@/lib/api/auth";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { jsonObjectSchema, slugParamsSchema } from "@/lib/api/schemas/boundary";
import { recordRevisionSnapshot } from "@/lib/blog/revisions";
import { invalidateCache } from "@/lib/cache";
import { BLOG_STATUSES, type BlogStatus } from "@/lib/constants";
import { parseImageFocalPoint } from "@/lib/imageFocalPoint";
import dbConnect from "@/lib/mongodb";
import { DEFAULT_TAG_MAX_LENGTH, normalizeTags } from "@/lib/tagUtils";
import { findUniqueSlug, titleToSlug } from "@/lib/slug";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";
import BlogPostRevision from "@/models/BlogPostRevision";

async function uniqueSlug(base: string, currentSlug?: string): Promise<string> {
  return findUniqueSlug(base, async (slug) => {
    const existing = await BlogPost.findOne({ slug }).select("slug").lean();
    return Boolean(existing && (!currentSlug || existing.slug !== currentSlug));
  });
}

type RouteContext = { params: Promise<{ slug: string }> };

// GET /api/admin/blog/[slug]
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

    const post = await BlogPost.findOne({ slug }).lean();
    if (!post) {
      return jsonError("NOT_FOUND", "Post not found.");
    }

    return jsonOk({ post });
  } catch (err) {
    logger.error("Admin blog lookup failed", {
      route: "GET /api/admin/blog/[slug]",
      operation: "get_post",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

// PATCH /api/admin/blog/[slug]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const user = authorization.data.user;

    const validatedParams = parseRouteParams(
      await context.params,
      slugParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug } = validatedParams.data;
    await dbConnect();

    const post = await BlogPost.findOne({ slug });
    if (!post) {
      return jsonError("NOT_FOUND", "Post not found.");
    }

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;
    const wasPublished = post.status === "published";

    // Updatable fields
    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title || title.length > 200) {
        return jsonError("VALIDATION_ERROR", "Title must be 1-200 characters.");
      }
      post.title = title;
      if (!wasPublished) {
        const newSlugBase = titleToSlug(title);
        if (newSlugBase) post.slug = await uniqueSlug(newSlugBase, slug);
      }
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

    if (body.tags !== undefined) {
      if (Array.isArray(body.tags)) {
        post.tags = normalizeTags(body.tags).filter(
          (tag) => tag.length <= DEFAULT_TAG_MAX_LENGTH,
        );
      }
    }

    // Update authors list if provided
    if (body.authors !== undefined && Array.isArray(body.authors)) {
      post.authors = body.authors
        .filter((a: any) => a.userId && a.name)
        .map((a: any) => ({ userId: a.userId, name: String(a.name) }));
    }

    // Auto-add current editor to authors if not already present
    const editorExists = post.authors.some(
      (a: any) => String(a.userId) === String(user.id),
    );
    if (!editorExists) {
      post.authors.push({ userId: user.id, name: user.name || "Unknown" });
    }

    if (body.status !== undefined) {
      if (BLOG_STATUSES.includes(body.status as BlogStatus)) {
        const newStatus = body.status as BlogStatus;
        // Set publishedAt on first publish
        if (newStatus === "published" && !post.publishedAt) {
          post.publishedAt = new Date();
        }
        post.status = newStatus;
      }
    }

    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) throw new Error("Blog post disappeared during update.");
        const before = current.toObject();
        current.set({
          title: post.title,
          slug: post.slug,
          content: post.content,
          excerpt: post.excerpt,
          coverImage: post.coverImage,
          coverFocalPoint: post.coverFocalPoint,
          authors: post.authors,
          tags: post.tags,
          status: post.status,
          publishedAt: post.publishedAt,
        });
        await current.save({ session: transaction });

        const isTransitionToPublished =
          before.status !== "published" && current.status === "published";
        const wasAlreadyPublished =
          before.status === "published" && current.status === "published";

        const contentFieldsChanged =
          before.title !== current.title ||
          before.content !== current.content ||
          before.excerpt !== current.excerpt ||
          before.coverImage !== current.coverImage ||
          before.tags?.length !== current.tags?.length ||
          before.tags?.some((t: string, i: number) => t !== current.tags[i]) ||
          JSON.stringify(before.coverFocalPoint) !==
            JSON.stringify(current.coverFocalPoint);

        if (isTransitionToPublished) {
          await recordRevisionSnapshot(transaction, {
            post: current,
            editor: { userId: user.id, name: user.name || "Unknown" },
            approvedBy: null,
            source: "initial_publish",
            changeSummary: "First publication",
          });
        } else if (wasAlreadyPublished && contentFieldsChanged) {
          await recordRevisionSnapshot(transaction, {
            post: current,
            editor: { userId: user.id, name: user.name || "Unknown" },
            approvedBy: null,
            source: "admin_edit",
            changeSummary:
              typeof body.changeSummary === "string"
                ? body.changeSummary
                : "Direct admin update",
            preEditState: before,
          });
        }

        return {
          result: current,
          audit: {
            actor: auditActor(user),
            category: "blog" as const,
            action:
              post.status === "published" && before.status !== "published"
                ? ("publish" as const)
                : ("update" as const),
            operation: "blog.admin.update",
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
    await invalidateCache("home");
    revalidatePath("/");
    revalidatePath(`/blog/${slug}`);
    if (saved.slug !== slug) revalidatePath(`/blog/${saved.slug}`);
    revalidatePath("/sitemap.xml");

    return jsonOk({ post: saved.toObject() });
  } catch (err) {
    logger.error("Admin blog update failed", {
      route: "PATCH /api/admin/blog/[slug]",
      operation: "update_post",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

// DELETE /api/admin/blog/[slug]
export async function DELETE(request: NextRequest, context: RouteContext) {
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
    if (!(await BlogPost.exists({ slug })))
      return jsonError("NOT_FOUND", "Post not found.");

    const dbSession = await mongoose.startSession();
    let result;
    try {
      result = await auditedTransaction(dbSession, async (transaction) => {
        const deleted = await BlogPost.findOneAndDelete(
          { slug },
          transaction ? { session: transaction } : undefined,
        );
        if (!deleted) throw new Error("Blog post disappeared during deletion.");

        const revQuery = BlogPostRevision.deleteMany({ postId: deleted._id });
        if (transaction) revQuery.session(transaction);
        await revQuery;

        return {
          result: deleted,
          audit: {
            actor: auditActor(authorization.data.user),
            category: "blog" as const,
            action: "delete" as const,
            operation: "blog.delete",
            target: {
              type: "blog-post",
              id: String(deleted._id),
              label: deleted.title,
            },
            before: summarizePublicContent(
              deleted.toObject() as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession();
    }
    if (!result) {
      return jsonError("NOT_FOUND", "Post not found.");
    }

    await invalidateCache("blog");
    await invalidateCache("admin:blog");
    await invalidateCache("home");
    revalidatePath("/");
    revalidatePath("/sitemap.xml");

    return jsonOk({ success: true });
  } catch (err) {
    logger.error("Admin blog deletion failed", {
      route: "DELETE /api/admin/blog/[slug]",
      operation: "delete_post",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
