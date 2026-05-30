/**
 * POST /api/admin/blog/upload-image - Upload blog images (admin only)
 * Stores images in a dedicated blog uploads directory.
 * Returns a public URL for use in markdown content or as cover image.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import crypto from "crypto";

export const runtime = "nodejs";

const BLOG_UPLOAD_DIR =
  process.env.BLOG_UPLOAD_DIR ?? path.join(process.cwd(), "uploads", "blog");

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
];

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Failed to parse form data." },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error:
            "Only image files are allowed (JPEG, PNG, GIF, WebP, AVIF, SVG).",
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Image must be 5MB or smaller." },
        { status: 400 },
      );
    }

    // Ensure upload directory exists
    if (!existsSync(BLOG_UPLOAD_DIR)) {
      await mkdir(BLOG_UPLOAD_DIR, { recursive: true });
    }

    const ext = path.extname(file.name).toLowerCase() || ".png";
    const storedName = `${crypto.randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(BLOG_UPLOAD_DIR, storedName), buffer);

    const url = `/api/blog/assets/${storedName}`;

    return NextResponse.json({ url, filename: storedName }, { status: 201 });
  } catch (err) {
    console.error("[Blog Admin] Upload image error:", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
