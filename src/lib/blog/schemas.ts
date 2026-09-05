import { z } from "zod";

import {
  paginationQueryFields,
  slugParamsSchema,
} from "@/lib/api/schemas/boundary";
import { BLOG_REVISION_SUMMARY_MAX_LENGTH } from "@/lib/constants";

const versionSchema = z
  .string()
  .regex(/^\d+$/, "Invalid version number.")
  .transform(Number)
  .pipe(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER));

export const blogRevisionParamsSchema = slugParamsSchema.extend({
  version: versionSchema,
});

export const blogRevisionQuerySchema = z.object({
  ...paginationQueryFields,
  version: versionSchema.optional(),
});

export const blogAdminPatchSchema = z
  .object({
    changeSummary: z
      .string()
      .trim()
      .max(BLOG_REVISION_SUMMARY_MAX_LENGTH)
      .optional(),
  })
  .passthrough();
