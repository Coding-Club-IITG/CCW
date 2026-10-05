/**
 * Shared admin image upload handler
 */

import crypto from "crypto";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import path from "path";

import { isHead } from "@/lib/access/roles";
import { auditActor, auditedTransaction } from "@/lib/audit/index";
import { summarizeFile } from "@/lib/audit/summary";
import { parseFormData } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { formDataObjectSchema } from "@/lib/api/schemas/boundary";
import { auth } from "@/lib/auth/server";
import {
  ALLOWED_IMAGE_EXTENSIONS,
  ALLOWED_IMAGE_MIME_TYPES,
  type AuditCategory,
  type UploadPrefix,
} from "@/lib/constants";
import { connectMongoDB } from "@/lib/db/mongodb";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";

import { getUploadStorage, removeUpload } from "@/lib/files/storage";

interface UploadOptions {
  /** Durable object namespace */
  prefix: UploadPrefix;
  /** Public URL prefix (Eg. "/uploads/events") */
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
    prefix,
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

      const ext = path.extname(file.name).toLowerCase() || ".png";
      if (!allowedExtensions.includes(ext)) {
        return jsonError("VALIDATION_ERROR", "Unsupported image file type");
      }
      const filename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await getUploadStorage().write(`${prefix}${filename}`, buffer, file.type);

      if (audit) {
        try {
          await connectMongoDB();
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
          } finally {
            await dbSession.endSession().catch((error) =>
              logger.warn("Image upload session cleanup failed", {
                operation: "end_upload_session",
                ...errorToLogMetadata(error),
              }),
            );
          }
        } catch (error) {
          await removeUpload(`${prefix}${filename}`);
          throw error;
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
