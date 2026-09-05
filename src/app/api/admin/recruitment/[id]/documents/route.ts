import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import mongoose from "mongoose";
import { NextRequest } from "next/server";
import path from "path";

import { requireHead } from "@/lib/api/auth";
import { parseFormData, parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonError, jsonOk, jsonResult } from "@/lib/api/result.server";
import { objectIdParamsSchema } from "@/lib/api/schemas/boundary";
import {
  recruitmentDocumentSlotSchema,
  recruitmentUploadSchema,
} from "@/lib/api/schemas/recruitment";
import { serializeRecruitment } from "@/lib/recruitment";
import {
  invalidateRecruitment,
  mutateRecruitment,
  recruitmentError,
  recruitmentNotFound,
  recruitmentUploadDirectory,
  removeRecruitmentFiles,
  summarizeRecruitment,
} from "@/lib/recruitment.server";
import Recruitment from "@/models/Recruitment";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  let storedName: string | null = null;
  let committed = false;
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const params = parseRouteParams(await context.params, objectIdParamsSchema);
    if (!params.ok) return jsonResult(params);
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError(
        "VALIDATION_ERROR",
        "Upload a PDF using multipart form data.",
      );
    }
    const parsed = parseFormData(form, recruitmentUploadSchema);
    if (!parsed.ok) return jsonResult(parsed);
    const { file, module, kind } = parsed.data;
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return jsonError("VALIDATION_ERROR", "The uploaded file is not a PDF.");
    }
    storedName = `${crypto.randomUUID()}.pdf`;
    await mkdir(recruitmentUploadDirectory, { recursive: true });
    await writeFile(
      path.join(
        /* turbopackIgnore: true */ recruitmentUploadDirectory,
        storedName,
      ),
      buffer,
      {
        flag: "wx",
      },
    );
    const document = {
      _id: new mongoose.Types.ObjectId(),
      storedName,
      originalName: path.basename(file.name),
      mimeType: "application/pdf" as const,
      size: file.size,
    };
    const result = await mutateRecruitment(
      authorization.data.user,
      "upload",
      "upload",
      async (session) => {
        const edition = await Recruitment.findById(params.data.id).session(
          session,
        );
        if (!edition) recruitmentNotFound();
        const before = summarizeRecruitment(edition);
        const slot = edition.modules.find((entry) => entry.module === module)![
          kind
        ];
        const previous = slot.document?.storedName;
        slot.document = document;
        await edition.save({ session });
        return {
          edition,
          before,
          result: { edition: serializeRecruitment(edition), previous },
        };
      },
    );
    committed = true;
    if (result.previous) await removeRecruitmentFiles([result.previous]);
    await invalidateRecruitment();
    return jsonOk(result.edition, { status: 201 });
  } catch (error) {
    if (storedName && !committed) await removeRecruitmentFiles([storedName]);
    return recruitmentError(error, "recruitment.upload", request);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const params = parseRouteParams(await context.params, objectIdParamsSchema);
    if (!params.ok) return jsonResult(params);
    const parsed = await parseJson(request, recruitmentDocumentSlotSchema);
    if (!parsed.ok) return jsonResult(parsed);
    const result = await mutateRecruitment(
      authorization.data.user,
      "delete",
      "remove_document",
      async (session) => {
        const edition = await Recruitment.findById(params.data.id).session(
          session,
        );
        if (!edition) recruitmentNotFound();
        const before = summarizeRecruitment(edition);
        const slot = edition.modules.find(
          (entry) => entry.module === parsed.data.module,
        )![parsed.data.kind];
        const storedName = slot.document?.storedName;
        slot.document = null;
        await edition.save({ session });
        return {
          edition,
          before,
          result: {
            edition: serializeRecruitment(edition),
            storedName,
          },
        };
      },
    );
    if (result.storedName) await removeRecruitmentFiles([result.storedName]);
    await invalidateRecruitment();
    return jsonOk(result.edition);
  } catch (error) {
    return recruitmentError(error, "recruitment.remove_document", request);
  }
}
