import { describe, expect, it, vi } from "vitest";

import {
  paginatedResponse,
  paginateQuery,
  parsePagination,
} from "@/lib/pagination";

describe("parsePagination", () => {
  it("uses safe defaults when parameters are absent", () => {
    expect(parsePagination(new URLSearchParams())).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
    });
  });

  it("clamps negative pages and excessive limits", () => {
    expect(
      parsePagination(new URLSearchParams({ page: "-3", limit: "1000" })),
    ).toEqual({ page: 1, limit: 100, skip: 0 });
  });

  it("falls back when parameters are not numbers", () => {
    expect(
      parsePagination(new URLSearchParams({ page: "nope", limit: "nope" }), {
        limit: 25,
      }),
    ).toEqual({ page: 1, limit: 25, skip: 0 });
  });
});

describe("paginatedResponse", () => {
  it("derives navigation metadata at a middle page", () => {
    expect(paginatedResponse(["a", "b"], 12, 2, 5)).toEqual({
      items: ["a", "b"],
      pagination: {
        page: 2,
        limit: 5,
        total: 12,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      },
    });
  });
});

describe("paginateQuery", () => {
  it("applies the derived offset and limit to a query", () => {
    const query = {
      skip: vi.fn(),
      limit: vi.fn(),
    };
    query.skip.mockReturnValue(query);
    query.limit.mockReturnValue(query);

    expect(paginateQuery(query, 3, 10)).toBe(query);
    expect(query.skip).toHaveBeenCalledWith(20);
    expect(query.limit).toHaveBeenCalledWith(10);
  });
});
