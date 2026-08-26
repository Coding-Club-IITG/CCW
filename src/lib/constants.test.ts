import { describe, expect, it } from "vitest";

import { getCFProblemUrl } from "@/lib/constants";

describe("getCFProblemUrl", () => {
  it("splits single-letter indices correctly", () => {
    expect(getCFProblemUrl("1678B")).toBe(
      "https://codeforces.com/problemset/problem/1678/B",
    );
  });

  it("splits multi-character indices like B1", () => {
    expect(getCFProblemUrl("1678B1")).toBe(
      "https://codeforces.com/problemset/problem/1678/B1",
    );
  });

  it("splits double-letter indices like AA", () => {
    expect(getCFProblemUrl("5678AA")).toBe(
      "https://codeforces.com/problemset/problem/5678/AA",
    );
  });

  it("handles single-digit contest IDs", () => {
    expect(getCFProblemUrl("4A")).toBe(
      "https://codeforces.com/problemset/problem/4/A",
    );
  });

  it("falls back for malformed input", () => {
    expect(getCFProblemUrl("unknown")).toBe(
      "https://codeforces.com/problemset/problem/unknown",
    );
  });
});
