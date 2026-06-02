/**
 * GET /api/projects/assets/[id] - Serve project images publicly
 */

import { NextRequest, NextResponse } from "next/server";
import { createReadStream, existsSync } from "fs";
import { Readable } from "stream";
import path from "path";

export const runtime = "nodejs";

const PROJECT_UPLOAD_DIR =
  process.env.PROJECT_UPLOAD_DIR ??
  path.join(process.cwd(), "uploads", "projects");

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!/^[0-9a-f]+\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(id)) {
      return NextResponse.json({ error: "Invalid asset ID." }, { status: 400 });
    }

    const filePath = path.join(PROJECT_UPLOAD_DIR, id);
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
    console.error("[Projects] GET /api/projects/assets/[id] error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
