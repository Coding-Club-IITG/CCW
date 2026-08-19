/**
 * Shared admin image upload handler
 */

import { NextRequest } from "next/server";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { auth } from "@/lib/auth";
import { isHead } from "@/lib/access/roles";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
} from "@/lib/constants";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { parseFormData } from "@/lib/api/result";
import { formDataObjectSchema } from "@/lib/api/schemas/boundary";

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
    user: Record<string, any>,
    request: NextRequest,
  ) => boolean | Promise<boolean>;
  /** Override allowed MIME types (default: ALLOWED_IMAGE_MIME_TYPES) */
  allowedMimeTypes?: readonly string[];
  /** Override allowed extensions (default: ALLOWED_IMAGE_EXTENSIONS) */
  allowedExtensions?: readonly string[];
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
  } = options;

  return async function POST(request: NextRequest) {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        return jsonError("UNAUTHENTICATED", "Unauthorized");
      }
      const user = session.user as any;
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
