import { describe, expect, it } from "vitest";

import { getCodeforcesProblemUrl } from "./roomPresentation";

describe("getCodeforcesProblemUrl", () => {
  it("keeps numeric suffixes in a Codeforces problem index", () => {
    expect(getCodeforcesProblemUrl("1678B1")).toBe(
      "https://codeforces.com/contest/1678/problem/B1",
    );
  });

  it("rejects malformed problem identifiers", () => {
    expect(getCodeforcesProblemUrl("1678")).toBeNull();
  });
});
