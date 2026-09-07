import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { Readable } from "stream";

import { parseRouteParams, parseSearchParams } from "@/lib/api/result";
import { jsonError, jsonResult } from "@/lib/api/result.server";
import { objectIdParamsSchema } from "@/lib/api/schemas/boundary";
import { recruitmentDocumentQuerySchema } from "@/lib/api/schemas/recruitment";
import { RECRUITMENT_DOCUMENT_KINDS } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { isDocumentReleased } from "@/lib/recruitment";
import {
  recruitmentError,
  recruitmentUploadDirectory,
} from "@/lib/recruitment.server";
import Recruitment from "@/models/Recruitment";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = parseRouteParams(await context.params, objectIdParamsSchema);
    if (!params.ok) return jsonResult(params);
    const query = parseSearchParams(
      request.nextUrl.searchParams,
      recruitmentDocumentQuerySchema,
    );
    if (!query.ok) return jsonResult(query);
    const id = params.data.id.toLowerCase();
    await dbConnect();
    const edition = await Recruitment.findOne({
      status: "published",
      $or: RECRUITMENT_DOCUMENT_KINDS.map((kind) => ({
        [`modules.${kind}.document._id`]: id,
      })),
    }).lean();
    const slot = edition?.modules
      .flatMap((module) =>
        RECRUITMENT_DOCUMENT_KINDS.map((kind) => module[kind]),
      )
      .find((slot) => String(slot.document?._id) === id);
    if (!edition || !slot?.document || !isDocumentReleased(edition, slot)) {
      return jsonError("NOT_FOUND", "PDF not found.", {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const file = slot.document;
    const filePath = path.join(recruitmentUploadDirectory, file.storedName);
    const info = await stat(filePath);
    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${query.data.download ? "attachment" : "inline"}; filename="recruitment.pdf"; filename*=UTF-8''${encodeURIComponent(file.originalName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Accept-Ranges": "bytes",
    };
    let start = 0;
    let end = info.size - 1;
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new NextResponse(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${info.size}` },
        });
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start < 0
      )
        return new NextResponse(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${info.size}` },
        });
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    }
    headers["Content-Length"] = String(end - start + 1);
    const stream = createReadStream(filePath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return jsonError("NOT_FOUND", "PDF not found.", {
        headers: { "Cache-Control": "no-store" },
      });
    return recruitmentError(error, "recruitment.stream_document", request);
  }
}
