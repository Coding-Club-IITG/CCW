import { NextRequest } from "next/server";

import { requireHead } from "@/lib/api/auth";
import { parseJson, parseRouteParams } from "@/lib/api/result";
import { jsonOk, jsonResult } from "@/lib/api/result.server";
import { objectIdParamsSchema } from "@/lib/api/schemas/boundary";
import { patchRecruitmentSchema } from "@/lib/api/schemas/recruitment";
import { RECRUITMENT_DOCUMENT_KINDS } from "@/lib/constants";
import { serializeRecruitment } from "@/lib/recruitment";
import {
  invalidateRecruitment,
  mutateRecruitment,
  recruitmentError,
  recruitmentNotFound,
  removeRecruitmentFiles,
  summarizeRecruitment,
} from "@/lib/recruitment.server";
import Recruitment from "@/models/Recruitment";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const params = parseRouteParams(await context.params, objectIdParamsSchema);
    if (!params.ok) return jsonResult(params);
    const parsed = await parseJson(request, patchRecruitmentSchema);
    if (!parsed.ok) return jsonResult(parsed);
    const patch = parsed.data;
    const result = await mutateRecruitment(
      authorization.data.user,
      patch.status === "published" ? "publish" : "update",
      "update",
      async (session) => {
        const edition = await Recruitment.findById(params.data.id).session(
          session,
        );
        if (!edition) recruitmentNotFound();
        const before = summarizeRecruitment(edition);
        if (patch.year !== undefined) edition.year = patch.year;
        if (patch.season !== undefined) edition.season = patch.season;
        if (patch.status !== undefined) {
          edition.status = patch.status;
          if (patch.status === "published" && !edition.publishedAt)
            edition.publishedAt = new Date();
        }
        for (const update of patch.modules ?? []) {
          const entry = edition.modules.find(
            (entry) => entry.module === update.module,
          )!;
          for (const kind of RECRUITMENT_DOCUMENT_KINDS) {
            const value = update[`${kind}ReleaseAt`];
            if (value !== undefined)
              entry[kind].releaseAt = value === null ? null : new Date(value);
          }
          if (update.submissionDeadline !== undefined) {
            entry.submissionDeadline =
              update.submissionDeadline === null
                ? null
                : new Date(update.submissionDeadline);
          }
        }
        await edition.save({ session });
        return {
          edition,
          before,
          result: serializeRecruitment(edition),
        };
      },
    );
    await invalidateRecruitment();
    return jsonOk(result);
  } catch (error) {
    return recruitmentError(error, "recruitment.update", request);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const authorization = await requireHead(request);
    if (!authorization.ok) return jsonResult(authorization);
    const params = parseRouteParams(await context.params, objectIdParamsSchema);
    if (!params.ok) return jsonResult(params);
    const files = await mutateRecruitment(
      authorization.data.user,
      "delete",
      "delete",
      async (session) => {
        const edition = await Recruitment.findById(params.data.id).session(
          session,
        );
        if (!edition) recruitmentNotFound();
        const files = edition.modules.flatMap((module) =>
          RECRUITMENT_DOCUMENT_KINDS.flatMap((kind) =>
            module[kind].document ? [module[kind].document!.storedName] : [],
          ),
        );
        await edition.deleteOne({ session });
        return {
          edition,
          deleted: true,
          before: summarizeRecruitment(edition),
          result: files,
        };
      },
    );
    await removeRecruitmentFiles(files);
    await invalidateRecruitment();
    return jsonOk(null);
  } catch (error) {
    return recruitmentError(error, "recruitment.delete", request);
  }
}
