/**
 * POST /api/admin/blog/[slug]/revision - Approve or reject a staged blog revision (admin only)
 */

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { z } from "zod";

import { requireHead } from "@/lib/api/auth";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { slugParamsSchema } from "@/lib/api/schemas/boundary";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizePublicContent } from "@/lib/audit/summary";
import { invalidateCache } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

const revisionActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

type RouteContext = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
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

    const parsedBody = await parseJson(request, revisionActionSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const { action } = parsedBody.data;

    await dbConnect();
    const post = await BlogPost.findOne({ slug });
    if (!post) {
      return jsonError("NOT_FOUND", "Blog post not found.");
    }

    if (!post.pendingRevision) {
      return jsonError("VALIDATION_ERROR", "No pending revision found for this post.");
    }

    const submitterUserId = post.pendingRevision?.submittedBy;

    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) throw new Error("Blog post disappeared during update.");
        const before = current.toObject();
        const rev = current.pendingRevision;
        if (!rev) throw new Error("No pending revision found on post.");

        if (action === "approve") {
          current.set({
            title: rev.title ?? current.title,
            content: rev.content ?? current.content,
            excerpt: rev.excerpt ?? current.excerpt,
            coverImage: rev.coverImage ?? current.coverImage,
            coverFocalPoint: rev.coverFocalPoint ?? current.coverFocalPoint,
            tags: rev.tags ?? current.tags,
            pendingRevision: null,
          });
          await current.save({ session: transaction });

          return {
            result: current,
            audit: {
              actor: auditActor(user),
              category: "blog" as const,
              action: "update" as const,
              operation: "blog.revision.approve",
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
        } else {
          current.set({ pendingRevision: null });
          await current.save({ session: transaction });

          return {
            result: current,
            audit: {
              actor: auditActor(user),
              category: "blog" as const,
              action: "delete" as const,
              operation: "blog.revision.reject",
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

    if (action === "approve") {
      await invalidateCache("blog");
      await invalidateCache("admin:blog");
      await invalidateCache("home");
      revalidatePath("/");
      revalidatePath(`/blog/${slug}`);
      revalidatePath("/sitemap.xml");
    } else {
      await invalidateCache("admin:blog");
    }

    // Send notification to author regarding revision decision
    if (submitterUserId) {
      try {
        const { notify } = await import("@/lib/notify");
        if (action === "approve") {
          await notify({
            userId: String(submitterUserId),
            type: "blog_revision",
            title: "Blog Revision Approved",
            message: `Your changes to "${saved.title}" have been approved and published!`,
            link: `/blog/${saved.slug}`,
          });
        } else {
          await notify({
            userId: String(submitterUserId),
            type: "blog_revision",
            title: "Blog Revision Rejected",
            message: `Your proposed updates to "${saved.title}" were not approved.`,
            link: `/internal/blog/${saved.slug}/edit`,
          });
        }
      } catch (notifErr) {
        logger.error("Failed to notify author of revision decision", {
          route: "POST /api/admin/blog/[slug]/revision",
          operation: "notify_author",
          ...errorToLogMetadata(notifErr),
        });
      }
    }

    return jsonOk({ post: saved.toObject() });
  } catch (err) {
    logger.error("Admin blog revision action failed", {
      route: "POST /api/admin/blog/[slug]/revision",
      operation: "process_revision",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
