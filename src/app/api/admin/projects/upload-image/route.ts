/**
 * POST /api/admin/projects/upload-image - Upload project images (admin only)
 */

import path from "path";
import { createImageUploadHandler } from "@/lib/uploadHandler";

export const runtime = "nodejs";

const UPLOAD_DIR =
  process.env.PROJECT_UPLOAD_DIR ??
  path.join(process.cwd(), "uploads", "projects");

export const POST = createImageUploadHandler({
  uploadDir: UPLOAD_DIR,
  urlPrefix: "/uploads/projects",
  maxSize: 5 * 1024 * 1024,
  logPrefix: "[Project Upload]",
});
