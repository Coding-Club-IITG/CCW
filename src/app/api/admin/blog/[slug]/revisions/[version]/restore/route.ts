/**
 * POST /api/admin/blog/[slug]/revisions/[version]/restore - Restore a blog post to an earlier version (admin only)
 */

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { z } from "zod";

import { requireHead } from "@/lib/api/auth";
import { parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizePublicContent } from "@/lib/audit/summary";
import {
  getPostRevisionByVersion,
  recordRevisionSnapshot,
} from "@/lib/blog/revisions";
import { invalidateCache } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import BlogPost from "@/models/BlogPost";

const restoreParamsSchema = z.object({
  slug: z.string().trim().min(1),
  version: z.coerce.number().int().min(1),
});

type RouteContext = { params: Promise<{ slug: string; version: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const user = authorization.data.user;

    const validatedParams = parseRouteParams(
      await context.params,
      restoreParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { slug, version: targetVersion } = validatedParams.data;

    await dbConnect();
    const dbSession = await mongoose.startSession();
    let saved;

    try {
      saved = await auditedTransaction(dbSession, async (transaction) => {
        const currentQuery = BlogPost.findOne({ slug });
        if (transaction) currentQuery.session(transaction);
        const current = await currentQuery;
        if (!current) {
          throw new Error("Blog post not found.");
        }
        if (current.status !== "published") {
          throw new Error("Only published posts can have revisions restored.");
        }

        const historicalRev = await getPostRevisionByVersion(
          current,
          targetVersion,
        );
        if (!historicalRev) {
          throw new Error(`Revision version ${targetVersion} not found.`);
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
        await current.save(transaction ? { session: transaction } : undefined);

        await recordRevisionSnapshot(transaction, {
          post: current,
          editor: { userId: user.id, name: user.name || "Admin" },
          approvedBy: { userId: user.id, name: user.name || "Admin" },
          source: "rollback",
          restoredFromVersion: targetVersion,
          changeSummary: `Restored to version ${targetVersion}`,
          preEditState: before,
        });

        return {
          result: current,
          audit: {
            actor: auditActor(user),
            category: "blog" as const,
            action: "update" as const,
            operation: "blog.revision.restore",
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
    revalidatePath("/sitemap.xml");

    return jsonOk({ post: saved.toObject() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error.";
    if (message.includes("not found")) {
      return jsonError("NOT_FOUND", message);
    }
    if (message.includes("Only published")) {
      return jsonError("CONFLICT", message);
    }
    logger.error("Admin blog restore failed", {
      route: "POST /api/admin/blog/[slug]/revisions/[version]/restore",
      operation: "restore_revision",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
