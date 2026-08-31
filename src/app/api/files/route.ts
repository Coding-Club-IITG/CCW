/**
 * GET  /api/files  - list all files the current user can access
 * POST /api/files  - upload a new file
 */

import crypto from "crypto";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import path from "path";
import { z } from "zod";

import { buildAccessFilter, canUploadFiles } from "@/lib/access/files";
import { getHeadModules, isAdmin } from "@/lib/access/roles";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeFile } from "@/lib/audit/summary";
import { parseFormData, parseSearchParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import {
  formDataObjectSchema,
  optionalSearchQuerySchema,
  paginationQueryFields,
} from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import { parsePagination, paginatedResponse } from "@/lib/pagination";
import { parseManagedModules, parseRoles } from "@/lib/roles";
import { prepareSearchQuery } from "@/lib/search";
import { validateTags } from "@/lib/tagUtils";
import { logger } from "@/lib/utils";
import FileEntry from "@/models/FileEntry";

export const runtime = "nodejs";

// Configuration

const UPLOAD_DIR = path.resolve(webEnv.FILE_UPLOAD_DIR);

const fileListQuerySchema = z.object({
  ...paginationQueryFields,
  search: optionalSearchQuerySchema,
  tag: z
    .union([z.string().max(1000), z.array(z.string().max(1000)).max(10)])
    .optional(),
});

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
    const query = parseSearchParams(searchParams, fileListQuerySchema);
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 30 });

    const accessFilter = buildAccessFilter(
      user.id,
      user.access,
      managedModules,
      roles,
    );

    const aggregateAccessFilter = buildAccessFilter(
      (mongoose.isValidObjectId(user.id)
        ? new mongoose.Types.ObjectId(user.id)
        : user.id) as unknown as string,
      user.access,
      managedModules,
      roles,
    );

    const rawTags = Array.isArray(query.data.tag)
      ? query.data.tag
      : query.data.tag === undefined
        ? []
        : [query.data.tag];
    const parsedTags = validateTags(rawTags, { maxTags: 10 });
    if (!parsedTags.ok) {
      return jsonError("VALIDATION_ERROR", parsedTags.error);
    }
    const search = prepareSearchQuery(query.data.search);
    const filters: Record<string, unknown>[] = [accessFilter];
    if (search) {
      const regex = { $regex: search.pattern, $options: "i" };
      filters.push({
        $or: [
          { title: regex },
          { description: regex },
          { originalName: regex },
          { uploadedByName: regex },
          { uploaderModule: regex },
          { tags: regex },
        ],
      });
    }
    if (parsedTags.tags.length) {
      const exactTags = parsedTags.tags.map((tag) => {
        const prepared = prepareSearchQuery(tag, { maxLength: 50 });
        return new RegExp(`^${prepared?.pattern ?? ""}$`, "i");
      });
      filters.push({ tags: { $all: exactTags } });
    }
    const filter = { $and: filters };

    const [files, total, availableTags] = await Promise.all([
      FileEntry.find(filter)
        .select(
          "title description originalName mimeType size tags uploadedBy uploadedByName uploaderModule isDownloadable accessControl createdAt updatedAt",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FileEntry.countDocuments(filter),
      FileEntry.aggregate<{ tag: string; count: number }>([
        { $match: aggregateAccessFilter },
        { $unwind: "$tags" },
        {
          $group: {
            _id: { $toLower: "$tags" },
            tag: { $min: "$tags" },
            count: { $sum: 1 },
          },
        },
        { $project: { _id: 0, tag: 1, count: 1 } },
        { $sort: { tag: 1 } },
      ]),
    ]);

    return jsonOk({
      ...paginatedResponse(files, total, page, limit),
      availableTags,
    });
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

    const parsedTags = validateTags(formData.getAll("tags"), {
      minTags: 1,
      maxTags: 10,
    });
    if (!parsedTags.ok) {
      return jsonError("VALIDATION_ERROR", parsedTags.error);
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
      const dbSession = await mongoose.startSession();
      let newFile;
      try {
        newFile = await auditedTransaction(dbSession, async (transaction) => {
          const [created] = await FileEntry.create(
            [
              {
                title,
                description,
                originalName: file.name,
                storedName,
                mimeType: file.type || "application/octet-stream",
                size: file.size,
                tags: parsedTags.tags,
                uploadedBy: user.id,
                uploadedByName: user.name,
                uploaderModule,
                isDownloadable,
                accessControl,
              },
            ],
            { session: transaction },
          );
          return {
            result: created,
            audit: {
              actor: auditActor(user),
              category: "files" as const,
              action: "upload" as const,
              operation: "files.upload",
              target: {
                type: "file",
                id: String(created._id),
                label: created.title,
              },
              after: summarizeFile(
                created.toObject() as unknown as Record<string, unknown>,
              ),
            },
          };
        });
      } finally {
        await dbSession.endSession();
      }

      logger.info("File uploaded", {
        route: "POST /api/files",
        operation: "upload_file",
        resourceId: newFile._id.toString(),
        fileSize: file.size,
      });
      const responseFile = newFile.toObject() as Record<string, unknown>;
      Reflect.deleteProperty(responseFile, "storedName");
      return jsonOk({ file: responseFile }, { status: 201 });
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
