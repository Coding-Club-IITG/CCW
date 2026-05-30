/**
 * GET /api/blog/assets/[id] - Serve blog images publicly
 * Only serves images that are referenced as cover images in published posts,
 * or any image uploaded via the blog image upload endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync } from "fs";
import { Readable } from "stream";
import path from "path";

export const runtime = "nodejs";

const BLOG_UPLOAD_DIR =
  process.env.BLOG_UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "blog");

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Validate filename format (UUID + extension only)
    if (!/^[0-9a-f-]+\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(id)) {
      return NextResponse.json({ error: "Invalid asset ID." }, { status: 400 });
    }

    const filePath = path.join(BLOG_UPLOAD_DIR, id);
    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    }

    const ext = path.extname(id).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".avif": "image/avif",
      ".svg": "image/svg+xml",
    };

    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Type": mimeMap[ext] || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[Blog] GET /api/blog/assets/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
