/**
 * POST /api/admin/blog/[slug]/revisions/[version]/restore - Restore a blog post to an earlier version (admin only)
 */

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";

import { requireHead } from "@/lib/api/auth";
import { parseRouteParams, type AppErrorCode } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizePublicContent } from "@/lib/audit/summary";
import {
  getPostRevisionByVersion,
  recordRevisionSnapshot,
} from "@/lib/blog/revisions";
import { blogRevisionParamsSchema } from "@/lib/blog/schemas";
import { invalidateCache } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
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
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const user = authorization.data.user;

    const validatedParams = parseRouteParams(
      await context.params,
      blogRevisionParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug, version: targetVersion } = validatedParams.data;

    await dbConnect();
    const dbSession = await mongoose.startSession();
    let saved;

    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const current = await BlogPost.findOne({ slug }).session(transaction);
        if (!current) {
          throw new BlogRouteError("NOT_FOUND", "Blog post not found.");
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

        if (current.status === "published") {
          await recordRevisionSnapshot(transaction, {
            post: current,
            editor: { userId: user.id, name: user.name || "Admin" },
            approvedBy: { userId: user.id, name: user.name || "Admin" },
            source: "rollback",
            restoredFromVersion: targetVersion,
            changeSummary: `Restored to version ${targetVersion}`,
            preEditState: before,
          });
        }

        return {
          result: current,
          audit: {
            actor: auditActor(user),
            category: "blog" as const,
            action: "update" as const,
            operation:
              current.status === "published"
                ? ("blog.revision.restore" as const)
                : ("blog.admin.update" as const),
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

    if (saved.status === "published") {
      await invalidateCache("blog");
      revalidatePath(`/blog/${slug}`);
    }
    await invalidateCache("admin:blog");
    await invalidateCache("home");
    revalidatePath("/");
    revalidatePath("/sitemap.xml");

    return jsonOk({ post: saved.toObject() });
  } catch (err: unknown) {
    if (err instanceof BlogRouteError) {
      return jsonError(err.code, err.message);
    }
    logger.error("Admin blog restore failed", {
      route: "POST /api/admin/blog/[slug]/revisions/[version]/restore",
      operation: "restore_revision",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
