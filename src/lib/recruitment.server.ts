import "server-only";

import { unlink } from "fs/promises";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import path from "path";

import { AppResultError } from "@/lib/api/result";
import { boundaryErrorResponse, jsonResult } from "@/lib/api/result.server";
import { auditActor, auditedTransaction } from "@/lib/audit";
import type { AuditSummary } from "@/lib/audit/types";
import {
  buildCacheKey,
  cachedFetch,
  CACHE_TTLS,
  invalidateCache,
} from "@/lib/cache";
import type { AuditAction } from "@/lib/constants";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import { publicRecruitment, serializeRecruitment } from "@/lib/recruitment";
import { errorToLogMetadata, logger } from "@/lib/utils";
import Recruitment, { type IRecruitment } from "@/models/Recruitment";

export const recruitmentUploadDirectory = path.resolve(
  webEnv.FILE_UPLOAD_DIR,
  "recruitment",
);
const publicProjection =
  "-modules.resources.document.storedName -modules.task.document.storedName -createdBy";

export async function getPublishedRecruitments(now = new Date()) {
  const editions = await cachedFetch(
    buildCacheKey("recruitment:public:v1"),
    CACHE_TTLS.RECRUITMENT,
    async () => {
      await dbConnect();
      const records = await Recruitment.find({ status: "published" })
        .select(publicProjection)
        .sort({ year: -1, season: -1 })
        .lean();
      return records.map(serializeRecruitment);
    },
  );
  // Time-dependent visibility must never be stored in Redis
  return editions.map((edition) => publicRecruitment(edition, now));
}

export async function getAdminRecruitments() {
  await dbConnect();
  const records = await Recruitment.find()
    .select(publicProjection)
    .sort({ year: -1, season: -1 })
    .lean();
  return records.map(serializeRecruitment);
}

export async function getAdminRecruitment(id: string) {
  await dbConnect();
  const edition = await Recruitment.findById(id)
    .select(publicProjection)
    .lean();
  return edition ? serializeRecruitment(edition) : null;
}

export function summarizeRecruitment(edition: IRecruitment): AuditSummary {
  return {
    label: edition.label,
    status: edition.status,
    publishedAt: edition.publishedAt?.toISOString() ?? null,
    resources: edition.modules.map(
      (module) =>
        `${module.module}: ${module.resources.document?._id ?? "unset"} @ ${module.resources.releaseAt?.toISOString() ?? "unset"}`,
    ),
    tasks: edition.modules.map(
      (module) =>
        `${module.module}: ${module.task.document?._id ?? "unset"} @ ${module.task.releaseAt?.toISOString() ?? "unset"}`,
    ),
    deadlines: edition.modules.map(
      (module) =>
        `${module.module}: ${module.submissionDeadline?.toISOString() ?? "unset"}`,
    ),
  };
}

type RecruitmentMutation<T> = {
  result: T;
  edition: IRecruitment;
  before?: AuditSummary;
  deleted?: boolean;
};

export async function mutateRecruitment<T>(
  user: Parameters<typeof auditActor>[0],
  action: AuditAction,
  operation: string,
  mutation: (
    session: mongoose.ClientSession,
  ) => Promise<RecruitmentMutation<T>>,
) {
  await dbConnect();
  const session = await mongoose.startSession();
  try {
    return await auditedTransaction(session, async (transaction) => {
      const { result, edition, before, deleted } = await mutation(transaction);
      return {
        result,
        audit: {
          actor: auditActor(user),
          category: "recruitment",
          action,
          operation: `recruitment.${operation}`,
          target: {
            type: "recruitment",
            id: String(edition._id),
            label: edition.label,
          },
          before,
          after: deleted ? {} : summarizeRecruitment(edition),
        },
      };
    });
  } finally {
    await session.endSession();
  }
}

export async function invalidateRecruitment() {
  await invalidateCache("recruitment:public:v1");
  revalidatePath("/recruitment");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/recruitment", "layout");
}

export async function removeRecruitmentFiles(storedNames: string[]) {
  for (const name of storedNames) {
    try {
      await unlink(path.join(recruitmentUploadDirectory, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn("Recruitment PDF cleanup failed", {
          operation: "recruitment.cleanup",
          ...errorToLogMetadata(error),
        });
      }
    }
  }
}

export function recruitmentError(
  error: unknown,
  operation: string,
  request: Request,
) {
  if (error instanceof AppResultError)
    return jsonResult({ ok: false, error: error.detail });
  return boundaryErrorResponse(operation, error, request);
}

export function recruitmentNotFound(): never {
  throw new AppResultError({
    code: "NOT_FOUND",
    message: "Recruitment edition not found.",
  });
}
