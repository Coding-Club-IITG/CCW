/**
 * Shared admin image upload handler
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
} from "@/lib/constants";

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
    allowedMimeTypes = ALLOWED_IMAGE_MIME_TYPES as readonly string[],
    allowedExtensions = ALLOWED_IMAGE_EXTENSIONS as readonly string[],
  } = options;

  return async function POST(request: NextRequest) {
    try {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (requireAdmin) {
        const user = session.user as any;
        if (!isAdmin(user.role)) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }

      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return NextResponse.json(
          { error: "Failed to parse form data." },
          { status: 400 },
        );
      }

      const file = formData.get("file") as File | null;
      if (!file || file.size === 0) {
        return NextResponse.json(
          { error: "No file provided." },
          { status: 400 },
        );
      }

      if (!allowedMimeTypes.includes(file.type)) {
        return NextResponse.json(
          {
            error: "Not a supported image file format",
          },
          { status: 400 },
        );
      }

      if (file.size > maxSize) {
        return NextResponse.json(
          {
            error: `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`,
          },
          { status: 400 },
        );
      }

      if (!existsSync(uploadDir)) {
        await mkdir(uploadDir, { recursive: true });
      }

      const ext = path.extname(file.name).toLowerCase() || ".png";
      if (!allowedExtensions.includes(ext)) {
        return NextResponse.json(
          {
            error: "Unsupported image file type",
          },
          { status: 400 },
        );
      }
      const filename = `${crypto.randomBytes(16).toString("hex")}${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadDir, filename), buffer);

      const url = `${urlPrefix}/${filename}`;
      return NextResponse.json({ url, filename }, { status: 201 });
    } catch (err) {
      console.error(`${logPrefix} Error:`, err);
      return NextResponse.json(
        { error: "Internal server error." },
        { status: 500 },
      );
    }
  };
}
