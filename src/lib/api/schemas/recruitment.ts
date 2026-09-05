import { z } from "zod";

import {
  MAX_RECRUITMENT_PDF_BYTES,
  MODULES,
  RECRUITMENT_DOCUMENT_KINDS,
  RECRUITMENT_SEASONS,
  RECRUITMENT_STATUSES,
} from "@/lib/constants";

const date = z.iso.datetime({ offset: true }).nullable().optional();
export const createRecruitmentSchema = z.strictObject({
  year: z.number().int().min(2000).max(2200),
  season: z.enum(RECRUITMENT_SEASONS),
});

export const patchRecruitmentSchema = createRecruitmentSchema.partial().extend({
  status: z.enum(RECRUITMENT_STATUSES).optional(),
  modules: z
    .array(
      z.strictObject({
        module: z.enum(MODULES),
        resourcesReleaseAt: date,
        taskReleaseAt: date,
        submissionDeadline: date,
      }),
    )
    .max(MODULES.length)
    .refine(
      (modules) =>
        new Set(modules.map((entry) => entry.module)).size === modules.length,
      "Each module may only appear once.",
    )
    .optional(),
});

export const recruitmentDocumentSlotSchema = z.strictObject({
  module: z.enum(MODULES),
  kind: z.enum(RECRUITMENT_DOCUMENT_KINDS),
});

export const recruitmentPdfSchema = z
  .instanceof(File)
  .refine(
    (file) =>
      file.type === "application/pdf" &&
      file.size > 0 &&
      file.size <= MAX_RECRUITMENT_PDF_BYTES,
    "Choose a non-empty PDF no larger than 20 MB.",
  )
  .refine(
    (file) => file.name.length <= 255,
    "The filename must be 255 characters or fewer.",
  );

export const recruitmentUploadSchema = recruitmentDocumentSlotSchema.extend({
  file: recruitmentPdfSchema,
});

export const recruitmentDocumentQuerySchema = z.strictObject({
  download: z.enum(["1"]).optional(),
});

export type RecruitmentPatch = z.infer<typeof patchRecruitmentSchema>;
