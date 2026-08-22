/**
 * GET  /api/files  - list all files the current user can access
 * POST /api/files  - upload a new file
 */

import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import FileEntry from "@/models/FileEntry";
import { canUploadFiles, buildAccessFilter } from "@/lib/access/files";
import { getHeadModules, isAdmin } from "@/lib/access/roles";
import { parseManagedModules, parseRoles } from "@/lib/roles";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { webEnv } from "@/lib/env/web";
import crypto from "crypto";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { logger } from "@/lib/utils";
import { parseFormData, parseSearchParams } from "@/lib/api/result";
import {
  formDataObjectSchema,
  paginationQuerySchema,
} from "@/lib/api/schemas/boundary";

export const runtime = "nodejs";

// Configuration

const UPLOAD_DIR = path.resolve(webEnv.FILE_UPLOAD_DIR);

async function ensureUploadDir(): Promise<void> {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
    logger.info(`[Files] Created upload directory: ${UPLOAD_DIR}`);
  }
}

// GET /api/files

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const user = session.user;
    const managedModules = parseManagedModules(user.managedModules);
    const roles = parseRoles(user.roles);

    await dbConnect();

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(searchParams, paginationQuerySchema);
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 30 });

    const accessFilter = buildAccessFilter(
      user.id,
      user.access,
      managedModules,
      roles,
    );

    const [files, total] = await Promise.all([
      FileEntry.find(accessFilter)
        .select("-storedName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FileEntry.countDocuments(accessFilter),
    ]);

    return jsonOk(paginatedResponse(files, total, page, limit));
  } catch (err) {
    logger.error("[Files] GET /api/files error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}

// POST /api/files

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return jsonError("UNAUTHENTICATED", "Unauthorized");
    }

    const user = session.user;
    const managedModules = parseManagedModules(user.managedModules);

    if (!canUploadFiles(user.access)) {
      return jsonError(
        "FORBIDDEN",
        "Only admins and module heads can upload files.",
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonError(
        "VALIDATION_ERROR",
        "Failed to parse form data. Check Content-Type header.",
      );
    }
    const parsedForm = parseFormData(formData, formDataObjectSchema);
    if (!parsedForm.ok) return jsonResult(parsedForm);

    // Extract fields

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return jsonError("VALIDATION_ERROR", "No file provided.");
    }

    const title = (formData.get("title") as string | null)?.trim();
    if (!title) {
      return jsonError("VALIDATION_ERROR", "Title is required.");
    }
    if (title.length > 200) {
      return jsonError(
        "VALIDATION_ERROR",
        "Title must be 200 characters or fewer.",
      );
    }

    const description =
      (formData.get("description") as string | null)?.trim() ?? "";
    if (description.length > 1000) {
      return jsonError(
        "VALIDATION_ERROR",
        "Description must be 1000 characters or fewer.",
      );
    }

    const folder =
      (formData.get("folder") as string | null)?.trim() || "General";
    if (folder.length > 100) {
      return jsonError(
        "VALIDATION_ERROR",
        "Folder name must be 100 characters or fewer.",
      );
    }

    const isDownloadable = formData.get("isDownloadable") === "true";

    const uploaderModuleRaw = formData.get("uploaderModule") as string | null;
    let uploaderModule: string | null = null;

    if (uploaderModuleRaw && uploaderModuleRaw !== "null") {
      const headModules = getHeadModules(user.access, managedModules);
      if (isAdmin(user.access)) {
        uploaderModule = uploaderModuleRaw;
      } else if (headModules.includes(uploaderModuleRaw as any)) {
        uploaderModule = uploaderModuleRaw;
      } else {
        return jsonError(
          "FORBIDDEN",
          "You cannot upload files under that module.",
        );
      }
    }

    let accessControl;
    try {
      const raw = formData.get("accessControl") as string | null;
      accessControl = raw ? JSON.parse(raw) : null;
    } catch {
      accessControl = null;
    }

    const defaultAcl = {
      allMembers: false,
      allowedModules: [],
      allowedClubPositions: [],
      allowedModulePositions: [],
      allowedUsers: [],
    };
    accessControl = { ...defaultAcl, ...accessControl };

    // Save to disk

    const originalExt = path.extname(file.name).toLowerCase();
    const storedName = `${crypto.randomUUID()}${originalExt}`;

    try {
      await ensureUploadDir();
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(UPLOAD_DIR, storedName), buffer);
    } catch (err) {
      logger.error("[Files] Disk write error:", err);
      return jsonError("INTERNAL_ERROR", "Failed to save file to disk.");
    }

    // Persist metadata

    try {
      await dbConnect();
      const newFile = await FileEntry.create({
        title,
        description,
        originalName: file.name,
        storedName,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        folder,
        uploadedBy: user.id,
        uploadedByName: user.name,
        uploaderModule,
        isDownloadable,
        accessControl,
      });

      logger.info("File uploaded", {
        route: "POST /api/files",
        operation: "upload_file",
        resourceId: newFile._id.toString(),
        fileSize: file.size,
      });
      return jsonOk({ file: newFile }, { status: 201 });
    } catch (err) {
      // Best-effort cleanup of the disk file if DB write fails
      try {
        const { unlink } = await import("fs/promises");
        await unlink(path.join(UPLOAD_DIR, storedName));
      } catch {}

      logger.error("[Files] DB write error:", err);
      return jsonError("INTERNAL_ERROR", "Failed to save file metadata.");
    }
  } catch (err) {
    logger.error("[Files] POST /api/files error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
