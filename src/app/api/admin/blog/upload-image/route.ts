/**
 * POST /api/admin/blog/upload-image - Upload blog images (admin only)
 * Stores images in a dedicated blog uploads directory.
 * Returns a public URL for use in markdown content or as cover image.
 */

import { createImageUploadHandler } from "@/lib/api/uploads/image";

export const runtime = "nodejs";

export const POST = createImageUploadHandler({
  prefix: "blog/",
  urlPrefix: "/api/blog/assets",
  maxSize: 5 * 1024 * 1024,
  logPrefix: "[Blog Upload]",
  audit: {
    category: "blog",
    operation: "blog.asset.upload",
    targetType: "blog-asset",
    label: "Blog image",
  },
});
