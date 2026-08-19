/**
 * Centralized pagination utility
 * Provides consistent offset-based pagination.
 */

import { paginationQuerySchema } from "@/lib/api/schemas/boundary";
import { z } from "zod";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export type PaginationParams = {
  page: number;
  limit: number;
  skip: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type PaginatedResult<T> = {
  items: T[];
  pagination: PaginationMeta;
};

/**
 * Parse pagination parameters from URL search params
 */
export function parsePagination(
  searchParams: URLSearchParams,
  defaults?: { limit?: number },
): PaginationParams {
  const defaultLimit = defaults?.limit ?? DEFAULT_LIMIT;
  const input = Object.fromEntries(searchParams.entries());
  const parsed = paginationQuerySchema.safeParse(input);
  const integer = z.coerce.number().int();
  const pageInput = integer.safeParse(
    parsed.success ? (parsed.data.page ?? "1") : (input.page ?? "1"),
  );
  const limitInput = integer.safeParse(
    parsed.success
      ? (parsed.data.limit ?? String(defaultLimit))
      : (input.limit ?? String(defaultLimit)),
  );
  const parsedPage = pageInput.success ? pageInput.data : 1;
  const parsedLimit = limitInput.success ? limitInput.data : defaultLimit;
  const page = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const limit = Math.min(
    MAX_LIMIT,
    Number.isFinite(parsedLimit) ? Math.max(1, parsedLimit) : defaultLimit,
  );
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Build a paginated response object
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / limit);
  return {
    items: data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Apply pagination to a Mongoose query
 * Returns the query with skip and limit applied.
 */
export function paginateQuery<T>(query: T, page: number, limit: number): T {
  const q = query as any;
  return q.skip((page - 1) * limit).limit(limit) as T;
}
