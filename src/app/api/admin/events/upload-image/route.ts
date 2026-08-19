/**
 * POST /api/admin/events/upload-image - Upload event images (admin only)
 */

import path from "path";
import { webEnv } from "@/lib/env/web";
import { createImageUploadHandler } from "@/lib/api/uploads/image";

export const runtime = "nodejs";

const UPLOAD_DIR = path.resolve(webEnv.EVENT_UPLOAD_DIR);

export const POST = createImageUploadHandler({
  uploadDir: UPLOAD_DIR,
  urlPrefix: "/api/events/assets",
  maxSize: 10 * 1024 * 1024,
  logPrefix: "[Event Upload]",
});
