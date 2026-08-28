/**
 * POST /api/admin/projects/upload-image - Upload project images (admin only)
 */

import path from "path";
import { webEnv } from "@/lib/env/web";
import { createImageUploadHandler } from "@/lib/api/uploads/image";

export const runtime = "nodejs";

const UPLOAD_DIR = path.resolve(webEnv.PROJECT_UPLOAD_DIR);

export const POST = createImageUploadHandler({
  uploadDir: UPLOAD_DIR,
  urlPrefix: "/api/projects/assets",
  maxSize: 5 * 1024 * 1024,
  logPrefix: "[Project Upload]",
  audit: {
    category: "projects",
    operation: "projects.asset.upload",
    targetType: "project-asset",
    label: "Project image",
  },
});
