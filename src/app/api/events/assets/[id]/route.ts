/**
 * GET /api/events/assets/[id] - Serve event images publicly
 */

import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync } from "fs";
import { Readable } from "stream";
import path from "path";
import {
  IMAGE_EXTENSIONS_REGEX_FRAGMENT,
  IMAGE_EXTENSION_TO_MIME,
  type ImageExtension,
} from "@/lib/constants";
import { errorToLogMetadata, logger } from "@/lib/utils";

export const runtime = "nodejs";

const EVENT_UPLOAD_DIR =
  process.env.EVENT_UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "events");

const ASSET_ID_REGEX = new RegExp(
  `^[0-9a-f]+\\.(${IMAGE_EXTENSIONS_REGEX_FRAGMENT})$`,
  "i",
);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!ASSET_ID_REGEX.test(id)) {
      return NextResponse.json({ error: "Invalid asset ID." }, { status: 400 });
    }

    const filePath = path.join(EVENT_UPLOAD_DIR, id);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
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
    logger.error("Event asset read failed", {
      route: "GET /api/events/assets/[id]",
      operation: "read_asset",
      ...errorToLogMetadata(err),
    });
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
