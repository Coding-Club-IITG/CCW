/**
 * POST /api/profile/upload-image - Upload profile picture (authenticated users)
 * Stores images in a dedicated avatars directory.
 * Returns a public URL for use as profile image.
 */

import path from "path";
import { createImageUploadHandler } from "@/lib/uploadHandler";

export const runtime = "nodejs";

const AVATAR_UPLOAD_DIR =
  process.env.AVATAR_UPLOAD_DIR ??
  path.join(process.cwd(), "uploads", "avatars");

const AVATAR_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;

const AVATAR_ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
] as const;

export const POST = createImageUploadHandler({
  uploadDir: AVATAR_UPLOAD_DIR,
  urlPrefix: "/api/profile/assets",
  maxSize: 2 * 1024 * 1024,
  logPrefix: "[Avatar Upload]",
  requireAdmin: false,
  allowedMimeTypes: AVATAR_ALLOWED_MIME_TYPES,
  allowedExtensions: AVATAR_ALLOWED_EXTENSIONS,
});
