/**
 * GET /api/projects/assets/[id] - Serve project images publicly
 */

import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import path from "path";

import { jsonError, jsonResult } from "@/lib/api/result.server";
import { getUploadStorage, ObjectNotFoundError } from "@/lib/files/storage";
import {
  IMAGE_EXTENSIONS_REGEX_FRAGMENT,
  IMAGE_EXTENSION_TO_MIME,
  type ImageExtension,
} from "@/lib/constants";
import { errorToLogMetadata, logger } from "@/lib/telemetry/logger";
import { parseRouteParams } from "@/lib/api/result";
import { imageAssetParamsSchema } from "@/lib/api/schemas/boundary";

export const runtime = "nodejs";

const ASSET_ID_REGEX = new RegExp(
  `^[0-9a-f]+\\.(${IMAGE_EXTENSIONS_REGEX_FRAGMENT})$`,
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

    const ext = path.extname(id).toLowerCase() as ImageExtension;
    const webStream = await getUploadStorage().read(`projects/${id}`);

    return new NextResponse(webStream, {
      headers: {
        "Content-Type":
          IMAGE_EXTENSION_TO_MIME[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof ObjectNotFoundError)
      return jsonError("NOT_FOUND", "Asset not found.");
    logger.error("Project asset read failed", {
      route: "GET /api/projects/assets/[id]",
      operation: "read_asset",
      ...errorToLogMetadata(err),
    });
    return jsonError("INTERNAL_ERROR", "Internal server error.");
  }
}
