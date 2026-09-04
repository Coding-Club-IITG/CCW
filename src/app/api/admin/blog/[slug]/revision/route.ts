/**
 * POST /api/admin/blog/[slug]/revision - Approve or reject a staged blog revision (admin only)
 */

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { z } from "zod";

import { requireHead } from "@/lib/api/auth";
import {
  parseJson,
  parseRouteParams,
  type AppErrorCode,
} from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { slugParamsSchema } from "@/lib/api/schemas/boundary";
import { auditActor, auditedTransaction } from "@/lib/audit";
import {
  summarizeBlogRevision,
  summarizePublicContent,
} from "@/lib/audit/summary";
import { invalidateCache } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

const revisionActionSchema = z
  .object({
    action: z.enum(["approve", "reject"]),
  })
  .strict();

class RevisionRouteError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
  }
}

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
    const dbSession = await mongoose.startSession();
    let saved;
    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) {
          throw new RevisionRouteError("NOT_FOUND", "Blog post not found.");
        }
        if (current.status !== "published") {
          throw new RevisionRouteError(
            "CONFLICT",
            "Only published posts can have revisions reviewed.",
          );
        }
        const before = current.toObject();
        const rev = current.pendingRevision;
        if (!rev) {
          throw new RevisionRouteError(
            "VALIDATION_ERROR",
            "No pending revision found for this post.",
          );
        }
        if (!rev.submittedAt) {
          throw new RevisionRouteError(
            "CONFLICT",
            "This revision has not been submitted for review.",
          );
        }

        if (action === "approve") {
          if (
            !rev.baseUpdatedAt ||
            rev.baseUpdatedAt.getTime() !== current.updatedAt.getTime()
          ) {
            throw new RevisionRouteError(
              "CONFLICT",
              "The live post changed after this revision was started. Discard it and create a new revision before approval.",
            );
          }

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
          const revisionBefore = rev.toObject?.() || rev;
          current.set({ pendingRevision: null });
          await current.save({ session: transaction, timestamps: false });

          return {
            result: current,
            audit: {
              actor: auditActor(user),
              category: "blog" as const,
              action: "delete" as const,
              operation: "blog.revision.reject",
              target: {
                type: "blog-revision",
                id: String(current._id),
                label: rev.title,
              },
              before: summarizeBlogRevision(
                revisionBefore as unknown as Record<string, unknown>,
              ),
              after: {},
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

    return jsonOk({ post: saved.toObject() });
  } catch (err) {
    if (err instanceof RevisionRouteError) {
      return jsonError(err.code, err.message);
    }
    logger.error("Admin blog revision action failed", {
      route: "POST /api/admin/blog/[slug]/revision",
      operation: "process_revision",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
