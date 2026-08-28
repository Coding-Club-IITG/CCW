/**
 * Shared admin image upload handler
 */

import crypto from "crypto";
import { existsSync } from "fs";
import { mkdir, unlink, writeFile } from "fs/promises";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import path from "path";

import { isHead } from "@/lib/access/roles";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeFile } from "@/lib/audit/summary";
import { parseFormData } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { formDataObjectSchema } from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  type AuditCategory,
} from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";

interface UploadOptions {
  /** Directory to store uploaded files */
  uploadDir: string;
  /** Public URL prefix (Rg. "/uploads/events") */
  urlPrefix: string;
  /** Maximum file size in bytes (default: 5MB) */
  maxSize?: number;
  /** Log prefix for errors (Eg. "[Event Upload]") */
  logPrefix?: string;
  /** Whether admin role is required (default: true) */
  requireAdmin?: boolean;
  /** Optional resource-level authorization check */
  authorize?: (
    user: Record<string, unknown>,
    request: NextRequest,
  ) => boolean | Promise<boolean>;
  /** Override allowed MIME types (default: ALLOWED_IMAGE_MIME_TYPES) */
  allowedMimeTypes?: readonly string[];
  /** Override allowed extensions (default: ALLOWED_IMAGE_EXTENSIONS) */
  allowedExtensions?: readonly string[];
  audit?: {
    category: AuditCategory;
    operation: string;
    targetType: string;
    label: string;
  };
}

export function createImageUploadHandler(options: UploadOptions) {
  const {
    uploadDir,
    urlPrefix,
    maxSize = 5 * 1024 * 1024,
    logPrefix = "[Upload]",
    requireAdmin = true,
    authorize,
    allowedMimeTypes = ALLOWED_IMAGE_MIME_TYPES as readonly string[],
    allowedExtensions = ALLOWED_IMAGE_EXTENSIONS as readonly string[],
    audit,
  } = options;

  return async function POST(request: NextRequest) {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        return jsonError("UNAUTHENTICATED", "Unauthorized");
      }
      const user = session.user;
      if (requireAdmin) {
        if (!isHead(user.access)) {
          return jsonError("FORBIDDEN", "Forbidden");
        }
      }
      if (authorize && !(await authorize(user, request))) {
        return jsonError("FORBIDDEN", "Forbidden");
      }

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return jsonError("VALIDATION_ERROR", "Failed to parse form data.");
      }
      const parsedForm = parseFormData(formData, formDataObjectSchema);
      if (!parsedForm.ok) return jsonResult(parsedForm);

      const file = formData.get("file") as File | null;
      if (!file || file.size === 0) {
        return jsonError("VALIDATION_ERROR", "No file provided.");
      }

      if (!allowedMimeTypes.includes(file.type)) {
        return jsonError(
          "VALIDATION_ERROR",
          "Not a supported image file format",
        );
      }

      if (file.size > maxSize) {
        return jsonError(
          "VALIDATION_ERROR",
          `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`,
        );
      }

      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      const ext = path.extname(file.name).toLowerCase() || ".png";
      if (!allowedExtensions.includes(ext)) {
        return jsonError("VALIDATION_ERROR", "Unsupported image file type");
      }
      const filename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(
        path.join(/* turbopackIgnore: true */ uploadDir, filename),
        buffer,
      );

      if (audit) {
        await dbConnect();
        const dbSession = await mongoose.startSession();
        try {
          await auditedTransaction(dbSession, async () => ({
            result: undefined,
            audit: {
              actor: auditActor(user),
              category: audit.category,
              action: "upload" as const,
              operation: audit.operation,
              target: {
                type: audit.targetType,
                id: crypto.randomUUID(),
                label: audit.label,
              },
              after: summarizeFile({
                title: audit.label,
                mimeType: file.type,
                size: file.size,
              }),
            },
          }));
        } catch (error) {
          await unlink(
            path.join(/* turbopackIgnore: true */ uploadDir, filename),
          ).catch(() => {});
          throw error;
        } finally {
          await dbSession.endSession();
        }
      }

      const url = `${urlPrefix}/${filename}`;
      return jsonOk({ url, filename }, { status: 201 });
    } catch (err) {
      logger.error(`${logPrefix} Upload failed`, {
        operation: "image_upload",
        ...errorToLogMetadata(err),
      });
      return jsonError("INTERNAL_ERROR", "Internal server error.");
    }
  };
}
