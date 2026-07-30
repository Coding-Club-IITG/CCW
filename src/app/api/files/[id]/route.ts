/**
 * GET    /api/files/[id]  - serve / stream a file to the client
 * PATCH  /api/files/[id]  - update file metadata / permissions
 * DELETE /api/files/[id]  - delete a file (disk + metadata)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import FileEntry from "@/models/FileEntry";
import mongoose from "mongoose";
import { canAccessFile, canManageFile } from "@/lib/fileAccess";
import { parseModuleRoles } from "@/lib/roles";
import { createReadStream, existsSync } from "fs";
import { unlink } from "fs/promises";
import { Readable } from "stream";
import path from "path";
import { invalidateCache } from "@/lib/cache";
import { errorToLogMetadata, logger } from "@/lib/utils";

export const runtime = "nodejs";

const UPLOAD_DIR =
  process.env.FILE_UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

// Shared helpers

type RouteContext = { params: Promise<{ id: string }> };

async function resolveSession(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const user = session.user as any;
  return {
    user,
    moduleRoles: parseModuleRoles(user.moduleRoles),
  };
}

// GET /api/files/[id]

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const auth_ = await resolveSession(request);
    if (!auth_) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid file ID." }, { status: 400 });
    }

    await dbConnect();
    const file = await FileEntry.findById(id).lean();
    if (!file) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const { user, moduleRoles } = auth_;
    if (!canAccessFile(user.id, user.role, moduleRoles, file as any)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
        return NextResponse.json(
          { error: "This file is view-only and cannot be opened directly." },
          { status: 403 },
        );
      }
    }

    const filePath = path.join(UPLOAD_DIR, file.storedName);
    if (!existsSync(filePath)) {
      logger.warn(
        `[Files] File missing on disk: ${file.storedName} (id: ${id})`,
      );
      return NextResponse.json(
        { error: "File data not found on server. Contact an admin." },
        { status: 410 },
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
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// PATCH /api/files/[id]

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const auth_ = await resolveSession(request);
    if (!auth_) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid file ID." }, { status: 400 });
    }

    await dbConnect();
    const file = await FileEntry.findById(id);
    if (!file) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const { user, moduleRoles } = auth_;
    if (!canManageFile(user.id, user.role, moduleRoles, file as any)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

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
        return NextResponse.json(
          { error: "Title cannot be empty." },
          { status: 400 },
        );
      }
      if (update.title.length > 200) {
        return NextResponse.json(
          { error: "Title must be 200 characters or fewer." },
          { status: 400 },
        );
      }
    }

    // Validate description
    if (update.description !== undefined) {
      update.description = String(update.description).trim();
      if (update.description.length > 1000) {
        return NextResponse.json(
          { error: "Description must be 1000 characters or fewer." },
          { status: 400 },
        );
      }
    }

    // Validate folder
    if (update.folder !== undefined) {
      update.folder = String(update.folder).trim();
      if (!update.folder) {
        return NextResponse.json(
          { error: "Folder cannot be empty." },
          { status: 400 },
        );
      }
      if (update.folder.length > 100) {
        return NextResponse.json(
          { error: "Folder name must be 100 characters or fewer." },
          { status: 400 },
        );
      }
    }

    // Validate isDownloadable
    if (
      update.isDownloadable !== undefined &&
      typeof update.isDownloadable !== "boolean"
    ) {
      return NextResponse.json(
        { error: "isDownloadable must be a boolean." },
        { status: 400 },
      );
    }

    // Validate accessControl structure
    if (update.accessControl !== undefined) {
      const acl = update.accessControl;
      if (typeof acl !== "object" || acl === null || Array.isArray(acl)) {
        return NextResponse.json(
          { error: "accessControl must be an object." },
          { status: 400 },
        );
      }
    }

    const updated = await FileEntry.findByIdAndUpdate(id, update, {
      returnDocument: "after",
    })
      .select("-storedName")
      .lean();

    logger.info("File metadata updated", {
      route: "PATCH /api/files/[id]",
      operation: "update_metadata",
      resourceId: id,
    });
    return NextResponse.json({ file: updated });
  } catch (err) {
    logger.error("[Files] PATCH /api/files/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// DELETE /api/files/[id]

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const auth_ = await resolveSession(request);
    if (!auth_) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid file ID." }, { status: 400 });
    }

    await dbConnect();
    const file = await FileEntry.findById(id);
    if (!file) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const { user, moduleRoles } = auth_;
    if (!canManageFile(user.id, user.role, moduleRoles, file as any)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // Remove from disk first, if it fails we log but still remove the DB entry
    // to avoid orphaned metadata pointing at ghost files
    const filePath = path.join(UPLOAD_DIR, file.storedName);
    try {
      await unlink(filePath);
    } catch (err) {
      logger.warn("File cleanup from disk failed", {
        route: "DELETE /api/files/[id]",
        operation: "delete_disk_file",
        resourceId: id,
        ...errorToLogMetadata(err),
      });
    }

    await FileEntry.findByIdAndDelete(id);
    await invalidateCache("files");

    logger.info("File deleted", {
      route: "DELETE /api/files/[id]",
      operation: "delete_file",
      resourceId: id,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[Files] DELETE /api/files/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
