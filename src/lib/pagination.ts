/**
 * Centralized pagination utility
 * Provides consistent offset-based pagination.
 */

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
  const parsedPage = parseInt(searchParams.get("page") || "1", 10);
  const parsedLimit = parseInt(
    searchParams.get("limit") || String(defaultLimit),
    10,
  );
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
