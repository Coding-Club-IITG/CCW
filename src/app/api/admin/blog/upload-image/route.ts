/**
 * POST /api/admin/blog/upload-image - Upload blog images (admin only)
 * Stores images in a dedicated blog uploads directory.
 * Returns a public URL for use in markdown content or as cover image.
 */

import path from "path";
import { webEnv } from "@/lib/env/web";
import { createImageUploadHandler } from "@/lib/api/uploads/image";

export const runtime = "nodejs";

const BLOG_UPLOAD_DIR = path.resolve(webEnv.BLOG_UPLOAD_DIR);

export const POST = createImageUploadHandler({
  uploadDir: BLOG_UPLOAD_DIR,
  urlPrefix: "/api/blog/assets",
  maxSize: 5 * 1024 * 1024,
  logPrefix: "[Blog Upload]",
});
