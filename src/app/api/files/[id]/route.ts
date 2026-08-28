/**
 * GET    /api/files/[id]  - serve / stream a file to the client
 * PATCH  /api/files/[id]  - update file metadata / permissions
 * DELETE /api/files/[id]  - delete a file (disk + metadata)
 */

import crypto from "crypto";
import { createReadStream, existsSync } from "fs";
import { rename, unlink } from "fs/promises";
import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { Readable } from "stream";

import { canAccessFile, canManageFile } from "@/lib/access/files";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeFile } from "@/lib/audit/summary";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  jsonObjectSchema,
  objectIdParamsSchema,
} from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth";
import { invalidateCache } from "@/lib/cache";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import { parseManagedModules, parseRoles } from "@/lib/roles";
import { errorToLogMetadata, logger } from "@/lib/utils";
import FileEntry from "@/models/FileEntry";

export const runtime = "nodejs";

const UPLOAD_DIR = path.resolve(webEnv.FILE_UPLOAD_DIR);

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

    await dbConnect();
    const file = await FileEntry.findById(id).lean();
    if (!file) {
      return jsonError("NOT_FOUND", "File not found.");
    }

    const { user, managedModules, roles } = auth_;
    if (
      !canAccessFile(user.id, user.access, managedModules, roles, file as any)
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

    const filePath = path.join(UPLOAD_DIR, file.storedName);
    if (!existsSync(filePath)) {
      logger.warn(
        `[Files] File missing on disk: ${file.storedName} (id: ${id})`,
      );
      return jsonError(
        "NOT_FOUND",
        "File data not found on server. Contact an admin.",
      );
    }

    // Stream the file using the Web Streams API (Node ≥ 18 / Next.js ≥ 13)
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

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

    await dbConnect();
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

    // Whitelist of editable fields (are immutable)
    const EDITABLE = [
      "title",
      "description",
      "folder",
      "isDownloadable",
      "accessControl",
    ] as const;

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

    // Validate folder
    if (update.folder !== undefined) {
      update.folder = String(update.folder).trim();
      if (!update.folder) {
        return jsonError("VALIDATION_ERROR", "Folder cannot be empty.");
      }
      if (update.folder.length > 100) {
        return jsonError(
          "VALIDATION_ERROR",
          "Folder name must be 100 characters or fewer.",
        );
      }
    }

    // Validate isDownloadable
    if (
      update.isDownloadable !== undefined &&
      typeof update.isDownloadable !== "boolean"
    ) {
      return jsonError("VALIDATION_ERROR", "isDownloadable must be a boolean.");
    }

    // Validate accessControl structure
    if (update.accessControl !== undefined) {
      const acl = update.accessControl;
      if (typeof acl !== "object" || acl === null || Array.isArray(acl)) {
        return jsonError(
          "VALIDATION_ERROR",
          "accessControl must be an object.",
        );
      }
    }

    const dbSession = await mongoose.startSession();
    let updated;
    try {
      updated = await auditedTransaction(dbSession, async (transaction) => {
        const before = await FileEntry.findById(id).session(transaction).lean();
        if (!before)
          throw new Error("File disappeared during metadata update.");
        const result = await FileEntry.findByIdAndUpdate(id, update, {
          returnDocument: "after",
          runValidators: true,
          session: transaction,
        })
          .select("-storedName")
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
      await dbSession.endSession();
    }

    logger.info("File metadata updated", {
      route: "PATCH /api/files/[id]",
      operation: "update_metadata",
      resourceId: id,
    });
    return jsonOk({ file: updated });
  } catch (err) {
    logger.error("[Files] PATCH /api/files/[id] error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
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

    await dbConnect();
    const file = await FileEntry.findById(id);
    if (!file) {
      return jsonError("NOT_FOUND", "File not found.");
    }

    const { user, managedModules } = auth_;
    if (!canManageFile(user.id, user.access, managedModules, file as any)) {
      return jsonError("FORBIDDEN", "Forbidden.");
    }

    const filePath = path.join(UPLOAD_DIR, file.storedName);
    const stagedPath = `${filePath}.deleting-${crypto.randomUUID()}`;
    let staged = false;
    try {
      await rename(filePath, stagedPath);
      staged = true;
    } catch (err) {
      if (existsSync(filePath)) {
        logger.error("File staging for deletion failed", {
          route: "DELETE /api/files/[id]",
          operation: "stage_disk_file",
          resourceId: id,
          ...errorToLogMetadata(err),
        });
        return jsonError("INTERNAL_ERROR", "Unable to stage file deletion.");
      }
      logger.warn("File data was already missing during deletion", {
        route: "DELETE /api/files/[id]",
        operation: "stage_disk_file",
        resourceId: id,
      });
    }
    const dbSession = await mongoose.startSession();
    try {
      await auditedTransaction(dbSession, async (transaction) => {
        const current = await FileEntry.findById(id)
          .session(transaction)
          .lean();
        if (!current) throw new Error("File disappeared during deletion.");
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
    } catch (error) {
      if (staged) await rename(stagedPath, filePath).catch(() => {});
      throw error;
    } finally {
      await dbSession.endSession();
    }
    if (staged)
      await unlink(stagedPath).catch((error) =>
        logger.warn("Staged file cleanup failed", {
          route: "DELETE /api/files/[id]",
          operation: "delete_staged_file",
          resourceId: id,
          ...errorToLogMetadata(error),
        }),
      );
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
