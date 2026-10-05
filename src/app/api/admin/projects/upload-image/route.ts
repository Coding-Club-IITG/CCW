/**
 * POST /api/admin/projects/upload-image - Upload project images (admin only)
 */

import { createImageUploadHandler } from "@/lib/api/uploads/image";

export const runtime = "nodejs";

export const POST = createImageUploadHandler({
  prefix: "projects/",
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
