/**
 * GET    /api/files/[id]  - serve / stream a file to the client
 * PATCH  /api/files/[id]  - update file metadata
 * DELETE /api/files/[id]  - delete a file (metadata + object)
 */

import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";

import { canAccessFile, canManageFile } from "@/lib/access/files";
import { auditActor, auditedTransaction } from "@/lib/audit/index";
import { summarizeFile } from "@/lib/audit/summary";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import {
  fileErrorResponse,
  fileFailure,
  memberGroupIds,
} from "@/lib/files/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  jsonObjectSchema,
  objectIdParamsSchema,
} from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth/server";
import { invalidateCache } from "@/lib/cache/redis";
import {
  getUploadStorage,
  removeUpload,
  ObjectNotFoundError,
} from "@/lib/files/storage";
import { connectMongoDB } from "@/lib/db/mongodb";
import { parseManagedModules, parseRoles } from "@/lib/users/roles";
import { validateTags } from "@/lib/shared/tags";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import FileEntry from "@/models/FileEntry";

export const runtime = "nodejs";

// Shared helpers

type RouteContext = { params: Promise<{ id: string }> };

async function resolveSession(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const user = session.user;
  return {
    user,
    managedModules: parseManagedModules(user.managedModules),
    roles: parseRoles(user.roles),
  };
}

// GET /api/files/[id]

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const rawParams = await context.params;

    const auth_ = await resolveSession(request);
    if (!auth_) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const validatedParams = parseRouteParams(rawParams, objectIdParamsSchema);
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;

    await connectMongoDB();
    const file = await FileEntry.findById(id).lean();
    if (!file) {
      return jsonError("NOT_FOUND", "File not found.");
    }

    const { user, managedModules, roles } = auth_;
    const groupIds = await memberGroupIds(user.id);
    if (
      !canAccessFile(
        user.id,
        user.access,
        managedModules,
        roles,
        file as any,
        groupIds,
      )
    ) {
      return jsonError("FORBIDDEN", "Forbidden.");
    }

    // Block direct navigation to view-only files
    if (!file.isDownloadable) {
      const secFetchDest = request.headers.get("sec-fetch-dest");
      const secFetchMode = request.headers.get("sec-fetch-mode");

      // Allow: iframe/embed/object embeds and fetch/XHR from same origin (for the viewer)
      // Block: direct navigation
      const isDirectNavigation =
        secFetchDest === "document" && secFetchMode === "navigate";

      if (isDirectNavigation) {
        return jsonError(
          "FORBIDDEN",
          "This file is view-only and cannot be opened directly.",
        );
      }
    }

    const webStream = await getUploadStorage().read(`files/${file.storedName}`);

    // For downloadable files: Content-Disposition attachment (triggers save dialog)
    // For view-only files: Content-Disposition inline (renders in browser / iframe)
    // The filename is intentionally omitted from inline responses
    const safeFilename = encodeURIComponent(file.originalName);
    const disposition = file.isDownloadable
      ? `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`
      : "inline";

    const headers: Record<string, string> = {
      "Content-Type": file.mimeType,
      "Content-Disposition": disposition,
      "Content-Length": String(file.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };

    if (!file.isDownloadable) {
      // Allow iframing only from the same origin (for in-app viewer)
      // This also blocks embedding on external sites
      headers["X-Frame-Options"] = "SAMEORIGIN";
      headers["Content-Security-Policy"] =
        "sandbox allow-scripts allow-same-origin; frame-ancestors 'self'";
      // Prevent browser "Save As" from saving a usable file and
      // block programmatic caching / service-worker interception
      headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
      headers["Cross-Origin-Resource-Policy"] = "same-origin";
    }

    return new NextResponse(webStream, { headers });
  } catch (err) {
    if (err instanceof ObjectNotFoundError)
      return jsonError(
        "NOT_FOUND",
        "File data not found on server. Contact an admin.",
      );
    logger.error("[Files] GET /api/files/[id] error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

// PATCH /api/files/[id]

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const rawParams = await context.params;

    const auth_ = await resolveSession(request);
    if (!auth_) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const validatedParams = parseRouteParams(rawParams, objectIdParamsSchema);
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;

    await connectMongoDB();
    const file = await FileEntry.findById(id);
    if (!file) {
      return jsonError("NOT_FOUND", "File not found.");
    }

    const { user, managedModules } = auth_;
    if (!canManageFile(user.id, user.access, managedModules, file as any)) {
      return jsonError("FORBIDDEN", "Forbidden.");
    }

    const parsedBody = await parseJson(request, jsonObjectSchema);
    if (!parsedBody.ok) return jsonResult(parsedBody);
    const body = parsedBody.data;

    if ("accessControl" in body || "isDownloadable" in body)
      return jsonError(
        "VALIDATION_ERROR",
        "Use Share to change access or download permissions.",
      );

    const EDITABLE = ["title", "description", "tags"] as const;

    const update: Record<string, any> = {};
    for (const key of EDITABLE) {
      if (key in body) update[key] = body[key];
    }

    // Validate title
    if (update.title !== undefined) {
      update.title = String(update.title).trim();
      if (!update.title) {
        return jsonError("VALIDATION_ERROR", "Title cannot be empty.");
      }
      if (update.title.length > 200) {
        return jsonError(
          "VALIDATION_ERROR",
          "Title must be 200 characters or fewer.",
        );
      }
    }

    // Validate description
    if (update.description !== undefined) {
      update.description = String(update.description).trim();
      if (update.description.length > 1000) {
        return jsonError(
          "VALIDATION_ERROR",
          "Description must be 1000 characters or fewer.",
        );
      }
    }

    if (update.tags !== undefined) {
      const parsedTags = validateTags(update.tags, {
        minTags: 1,
        maxTags: 10,
      });
      if (!parsedTags.ok) {
        return jsonError("VALIDATION_ERROR", parsedTags.error);
      }
      update.tags = parsedTags.tags;
    }

    const dbSession = await mongoose.startSession();
    let updated;
    try {
      updated = await auditedTransaction(dbSession, async (transaction) => {
        const before = await FileEntry.findById(id).session(transaction).lean();
        if (!before)
          throw new Error("File disappeared during metadata update.");
        if (!canManageFile(user.id, user.access, managedModules, before as any))
          fileFailure("FORBIDDEN", "You cannot manage this file.");
        if (
          before.updatedAt.getTime() !== file.updatedAt.getTime() ||
          (body.updatedAt !== undefined &&
            body.updatedAt !== before.updatedAt.toISOString())
        )
          fileFailure(
            "CONFLICT",
            "This file has changed. Refresh the page before saving.",
          );
        const result = await FileEntry.findByIdAndUpdate(id, update, {
          returnDocument: "after",
          runValidators: true,
          session: transaction,
        })
          .select(
            "title description originalName mimeType size tags uploadedBy uploadedByName uploaderModule isDownloadable accessControl createdAt updatedAt",
          )
          .lean();
        if (!result)
          throw new Error("File disappeared during metadata update.");
        return {
          result,
          audit: {
            actor: auditActor(user),
            category: "files" as const,
            action: "update" as const,
            operation: "files.metadata.update",
            target: { type: "file", id, label: result.title },
            before: summarizeFile(before as unknown as Record<string, unknown>),
            after: summarizeFile(result as unknown as Record<string, unknown>),
          },
        };
      });
    } finally {
      await dbSession.endSession().catch((error) =>
        logger.warn("File session cleanup failed", {
          operation: "end_file_session",
          ...errorToLogMetadata(error),
        }),
      );
    }

    logger.info("File metadata updated", {
      route: "PATCH /api/files/[id]",
      operation: "update_metadata",
      resourceId: id,
    });
    return jsonOk({ file: updated });
  } catch (err) {
    return fileErrorResponse("files.metadata.update", err, request);
  }
}

// DELETE /api/files/[id]

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const rawParams = await context.params;

    const auth_ = await resolveSession(request);
    if (!auth_) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const validatedParams = parseRouteParams(rawParams, objectIdParamsSchema);
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;

    await connectMongoDB();
    const file = await FileEntry.findById(id);
    if (!file) {
      return jsonError("NOT_FOUND", "File not found.");
    }

    const { user, managedModules } = auth_;
    if (!canManageFile(user.id, user.access, managedModules, file as any)) {
      return jsonError("FORBIDDEN", "Forbidden.");
    }

    const dbSession = await mongoose.startSession();
    try {
      await auditedTransaction(dbSession, async (transaction) => {
        const current = await FileEntry.findById(id)
          .session(transaction)
          .lean();
        if (!current) throw new Error("File disappeared during deletion.");
        if (
          !canManageFile(user.id, user.access, managedModules, current as any)
        )
          fileFailure("FORBIDDEN", "Forbidden.");
        await FileEntry.deleteOne({ _id: id }, { session: transaction });
        return {
          result: undefined,
          audit: {
            actor: auditActor(user),
            category: "files" as const,
            action: "delete" as const,
            operation: "files.delete",
            target: { type: "file", id, label: current.title },
            before: summarizeFile(
              current as unknown as Record<string, unknown>,
            ),
          },
        };
      });
    } finally {
      await dbSession.endSession().catch((error) =>
        logger.warn("File session cleanup failed", {
          operation: "end_file_session",
          ...errorToLogMetadata(error),
        }),
      );
    }
    await removeUpload(`files/${file.storedName}`);
    await invalidateCache("files");

    logger.info("File deleted", {
      route: "DELETE /api/files/[id]",
      operation: "delete_file",
      resourceId: id,
    });
    return jsonOk({ success: true });
  } catch (err) {
    logger.error("[Files] DELETE /api/files/[id] error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
