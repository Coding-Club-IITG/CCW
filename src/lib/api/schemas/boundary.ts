import { z } from "zod";

/** Baseline object boundary for handlers that apply narrower domain validation next */
export const jsonObjectSchema = z.record(z.string(), z.unknown());
export const formDataObjectSchema = z.record(z.string(), z.unknown());

export const objectIdParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "id must be a valid ObjectId"),
});

export const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(250),
});

export const imageAssetParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-f-]+\.(?:png|jpe?g|gif|webp|avif)$/i),
});

export const paginationQueryFields = {
  page: z.string().regex(/^\d+$/, "page must be a positive integer").optional(),
  limit: z
    .string()
    .regex(/^\d+$/, "limit must be a positive integer")
    .optional(),
};

export const optionalSearchQuerySchema = z.string().trim().max(200).optional();

export const paginationQuerySchema = z
  .object(paginationQueryFields)
  .passthrough();
