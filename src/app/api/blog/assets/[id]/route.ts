/**
 * GET /api/blog/assets/[id] - Serve blog images publicly
 * Only serves images that are referenced as cover images in published posts,
 * or any image uploaded via the blog image upload endpoint.
 */

import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonError, jsonResult } from "@/lib/api/result.server";
import { createReadStream, existsSync } from "fs";
import { Readable } from "stream";
import path from "path";
import { webEnv } from "@/lib/env/web";
import {
  IMAGE_EXTENSIONS_REGEX_FRAGMENT,
  IMAGE_EXTENSION_TO_MIME,
  type ImageExtension,
} from "@/lib/constants";
import { errorToLogMetadata, logger } from "@/lib/utils";
import { parseRouteParams } from "@/lib/api/result";
import { imageAssetParamsSchema } from "@/lib/api/schemas/boundary";

export const runtime = "nodejs";

const BLOG_UPLOAD_DIR = path.resolve(webEnv.BLOG_UPLOAD_DIR);

const ASSET_ID_REGEX = new RegExp(
  `^[0-9a-f-]+\\.(${IMAGE_EXTENSIONS_REGEX_FRAGMENT})$`,
  "i",
);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const validatedParams = parseRouteParams(
      await context.params,
      imageAssetParamsSchema,
    );
    if (!validatedParams.ok) return jsonResult(validatedParams);
    const { id } = validatedParams.data;

    if (!ASSET_ID_REGEX.test(id)) {
      return jsonError("VALIDATION_ERROR", "Invalid asset ID.");
    }

    const filePath = path.join(BLOG_UPLOAD_DIR, id);
    if (!existsSync(filePath)) {
      return jsonError("NOT_FOUND", "Asset not found.");
    }

    const ext = path.extname(id).toLowerCase() as ImageExtension;
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type":
          IMAGE_EXTENSION_TO_MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    logger.error("Blog asset read failed", {
      route: "GET /api/blog/assets/[id]",
      operation: "read_asset",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
