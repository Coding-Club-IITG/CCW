/**
 * POST /api/admin/events/upload-image - Upload event images (admin only)
 */

import path from "path";
import { createImageUploadHandler } from "@/lib/uploadHandler";

export const runtime = "nodejs";

const UPLOAD_DIR =
  process.env.EVENT_UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "events");

export const POST = createImageUploadHandler({
  uploadDir: UPLOAD_DIR,
  urlPrefix: "/api/events/assets",
  maxSize: 10 * 1024 * 1024,
  logPrefix: "[Event Upload]",
});
