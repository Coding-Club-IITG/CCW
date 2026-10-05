/**
 * POST /api/admin/events/upload-image - Upload event images (admin only)
 */

import { createImageUploadHandler } from "@/lib/api/uploads/image";

export const runtime = "nodejs";

export const POST = createImageUploadHandler({
  prefix: "events/",
  urlPrefix: "/api/events/assets",
  maxSize: 10 * 1024 * 1024,
  logPrefix: "[Event Upload]",
  audit: {
    category: "events",
    operation: "events.asset.upload",
    targetType: "event-asset",
    label: "Event image",
  },
});
