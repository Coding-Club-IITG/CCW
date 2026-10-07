/**
 * GET  /api/files  - list all files the current user can access
 * POST /api/files  - upload a new file
 */

import crypto from "crypto";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import path from "path";

import { buildAccessFilter, canUploadFiles } from "@/lib/access/files";
import { getHeadModules, isAdmin } from "@/lib/access/roles";
import { auditActor } from "@/lib/audit/index";
import { summarizeFile } from "@/lib/audit/summary";
import {
  parseFormData,
  parseSearchParams,
  validationError,
} from "@/lib/api/result";
import {
  fileAccessControlSchema,
  createFileUploadSchema,
} from "@/lib/api/schemas/files";
import { notifyFileShared } from "@/lib/files/notifications";
import { fileListQuerySchema } from "@/lib/files/query";
import {
  fileErrorResponse,
  lockSharingGroups,
  memberGroupIds,
  mutateFiles,
} from "@/lib/files/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { formDataObjectSchema } from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth/server";
import { webEnv } from "@/lib/env/web";
import { getUploadStorage, removeUpload } from "@/lib/files/storage";
import { connectMongoDB } from "@/lib/db/mongodb";
import { parsePagination, paginatedResponse } from "@/lib/shared/pagination";
import { parseManagedModules, parseRoles } from "@/lib/users/roles";
import { prepareSearchQuery } from "@/lib/shared/search";
import { validateTags } from "@/lib/shared/tags";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import FileEntry from "@/models/FileEntry";
import SharingGroup from "@/models/SharingGroup";

export const runtime = "nodejs";

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

    await connectMongoDB();

    const groupIds = await memberGroupIds(user.id);

    const { searchParams } = new URL(request.url);
    const query = parseSearchParams(searchParams, fileListQuerySchema);
    if (!query.ok) return jsonResult(query);
    const { page, limit, skip } = parsePagination(searchParams, { limit: 30 });

    const accessFilter = buildAccessFilter(
      user.id,
      user.access,
      managedModules,
      roles,
      groupIds,
    );

    const aggregateAccessFilter = buildAccessFilter(
      (mongoose.isValidObjectId(user.id)
        ? new mongoose.Types.ObjectId(user.id)
        : user.id) as unknown as string,
      user.access,
      managedModules,
      roles,
      groupIds,
    );

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
    if (query.data.tag.length) {
      const exactTags = query.data.tag.map((tag) => {
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

    const sharedGroupIds = files.flatMap(
      (file) => file.accessControl.allowedGroups ?? [],
    );
    const sharedGroups = await SharingGroup.find({
      _id: { $in: sharedGroupIds },
    })
      .select("name")
      .lean();
    return jsonOk({
      ...paginatedResponse(files, total, page, limit),
      availableTags,
      groupNames: Object.fromEntries(
        sharedGroups.map((group) => [String(group._id), group.name]),
      ),
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

    const parsedFile = createFileUploadSchema(
      webEnv.MAX_FILE_UPLOAD_BYTES,
    ).safeParse(formData.get("file"));
    if (!parsedFile.success) {
      return jsonError("VALIDATION_ERROR", parsedFile.error.issues[0].message);
    }
    const file = parsedFile.data;

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

    let rawAccessControl: unknown = {};
    try {
      const raw = formData.get("accessControl") as string | null;
      rawAccessControl = raw ? JSON.parse(raw) : {};
    } catch {
      return jsonError(
        "VALIDATION_ERROR",
        "Access permissions must be valid JSON.",
      );
    }
    const parsedAcl = fileAccessControlSchema.safeParse(rawAccessControl);
    if (!parsedAcl.success) return jsonResult(validationError(parsedAcl.error));
    const accessControl = parsedAcl.data;

    // Store the object before committing its metadata

    const originalExt = path.extname(file.name).toLowerCase();
    const storedName = `${crypto.randomUUID()}${originalExt}`;

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      await getUploadStorage().write(
        `files/${storedName}`,
        buffer,
        file.type || "application/octet-stream",
      );
    } catch (err) {
      logger.error("File upload failed", {
        operation: "write_upload",
        ...errorToLogMetadata(err),
      });
      return jsonError("INTERNAL_ERROR", "Failed to save file.");
    }

    // Persist metadata

    let committed = false;
    try {
      const newFile = await mutateFiles(async (transaction) => {
        await lockSharingGroups(accessControl.allowedGroups, transaction);
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
          notificationIds: await notifyFileShared(
            created,
            null,
            user,
            transaction,
          ),
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

      committed = true;
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
      if (!committed) await removeUpload(`files/${storedName}`);

      return fileErrorResponse("files.upload", err, request);
    }
  } catch (err) {
    logger.error("[Files] POST /api/files error:", err);
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
