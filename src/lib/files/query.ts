import { z } from "zod";

import { parseSearchParams } from "@/lib/api/result";
import {
  optionalSearchQuerySchema,
  paginationQueryFields,
} from "@/lib/api/schemas/boundary";
import { parsePagination } from "@/lib/shared/pagination";
import { queryParamsWithDefaults } from "@/lib/shared/queryParams";
import { prepareSearchQuery } from "@/lib/shared/search";
import { validateTags } from "@/lib/shared/tags";

export const fileListQuerySchema = z.object({
  ...paginationQueryFields,
  search: optionalSearchQuerySchema,
  tag: z
    .union([z.string().max(1000), z.array(z.string().max(1000)).max(10)])
    .optional()
    .transform((value, context) => {
      const result = validateTags(
        Array.isArray(value) ? value : value === undefined ? [] : [value],
        { maxTags: 10 },
      );
      if (!result.ok) {
        context.addIssue({ code: "custom", message: result.error });
        return z.NEVER;
      }
      return result.tags;
    }),
});

export type FileQuery = {
  search: string;
  tag: string[];
  page: number;
  limit: number;
};

export const DEFAULT_FILE_QUERY: FileQuery = {
  search: "",
  tag: [],
  page: 1,
  limit: 30,
};

export function fileQueryFromParams(params: URLSearchParams): FileQuery {
  const result = parseSearchParams(params, fileListQuerySchema);
  if (!result.ok) return DEFAULT_FILE_QUERY;
  const { page, limit } = parsePagination(params, DEFAULT_FILE_QUERY);
  return {
    search: prepareSearchQuery(result.data.search)?.query ?? "",
    tag: result.data.tag,
    page,
    limit,
  };
}

export function fileQueryParams(
  query: FileQuery,
  current = new URLSearchParams(),
): URLSearchParams {
  return queryParamsWithDefaults(query, DEFAULT_FILE_QUERY, current);
}
