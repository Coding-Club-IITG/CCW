import { describe, expect, it } from "vitest";

import { DEFAULT_SEARCH_MAX_LENGTH, prepareSearchQuery } from "@/lib/search";

describe("prepareSearchQuery", () => {
  it("trims input and escapes every regular-expression metacharacter", () => {
    expect(prepareSearchQuery("  .*+?^${}()|[]\\  ")).toEqual({
      query: ".*+?^${}()|[]\\",
      pattern: "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\",
    });
  });

  it("rejects non-strings and queries shorter than the requested minimum", () => {
    expect(prepareSearchQuery({ search: "club" })).toBeNull();
    expect(prepareSearchQuery(" a ", { minLength: 2 })).toBeNull();
  });

  it("limits query and pattern length before they reach MongoDB", () => {
    const value = "a".repeat(DEFAULT_SEARCH_MAX_LENGTH + 20);

    const result = prepareSearchQuery(value);

    expect(result?.query).toHaveLength(DEFAULT_SEARCH_MAX_LENGTH);
    expect(result?.pattern).toHaveLength(DEFAULT_SEARCH_MAX_LENGTH);
  });
});
