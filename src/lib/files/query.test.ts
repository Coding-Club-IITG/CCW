import { describe, expect, it } from "vitest";

import {
  DEFAULT_FILE_QUERY,
  fileListQuerySchema,
  fileQueryFromParams,
  fileQueryParams,
} from "./query";

describe("file listing URLs", () => {
  it("omits defaults and preserves unrelated parameters while clearing filters", () => {
    const current = new URLSearchParams(
      "search=old&tag=Design&tag=Minutes&page=3&limit=5&unrelated=kept",
    );
    const result = fileQueryParams(DEFAULT_FILE_QUERY, current);
    expect(result.toString()).toBe("unrelated=kept");
    expect(current.getAll("tag")).toEqual(["Design", "Minutes"]);
    expect(fileQueryFromParams(result)).toEqual(DEFAULT_FILE_QUERY);
  });

  it("round-trips search, repeated tags and pagination with URL-sensitive characters", () => {
    const query = {
      search: "[guide] C++ & UI/UX",
      tag: ["Meeting Notes", "C++", "设计"],
      page: 3,
      limit: 15,
    };
    const params = fileQueryParams(query);
    expect(params.getAll("tag")).toEqual(query.tag);
    expect(fileQueryFromParams(new URLSearchParams(params.toString()))).toEqual(
      query,
    );
  });

  it("normalizes whitespace and duplicate tags case-insensitively", () => {
    const params = new URLSearchParams(
      "search=++notes++&tag=+Meeting+++Notes+&tag=meeting+notes&tag=Design&tag=",
    );
    expect(fileQueryFromParams(params)).toEqual({
      ...DEFAULT_FILE_QUERY,
      search: "notes",
      tag: ["Meeting Notes", "Design"],
    });
  });

  it.each([
    "page=-1",
    "page=1.5",
    "page=nope",
    "search=one&search=two",
    "limit=one",
  ])("falls back safely for malformed URL parameters: %s", (value) =>
    expect(fileQueryFromParams(new URLSearchParams(value))).toEqual(
      DEFAULT_FILE_QUERY,
    ),
  );

  it("uses the existing pagination and search limits", () => {
    const query = fileQueryFromParams(
      new URLSearchParams({ search: "a".repeat(150), page: "0", limit: "999" }),
    );
    expect(query).toEqual({
      ...DEFAULT_FILE_QUERY,
      search: "a".repeat(100),
      limit: 100,
    });
  });

  it("rejects invalid tag filters in the API schema", () => {
    expect(fileListQuerySchema.safeParse({ tag: "a".repeat(51) }).success).toBe(
      false,
    );
    expect(
      fileListQuerySchema.safeParse({
        tag: Array.from({ length: 11 }, (_, index) => `Tag ${index}`),
      }).success,
    ).toBe(false);
    expect(
      fileListQuerySchema.parse({ tag: ["Design", "design"] }).tag,
    ).toEqual(["Design"]);
  });
});
