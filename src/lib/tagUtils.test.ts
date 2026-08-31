import { describe, expect, it } from "vitest";

import {
  normalizeTag,
  normalizeTags,
  parseTagList,
  validateTags,
} from "@/lib/tagUtils";

describe("tag utilities", () => {
  it("trims and collapses whitespace while preserving display casing", () => {
    expect(normalizeTag("  Design\n  Systems  ")).toBe("Design Systems");
  });

  it("deduplicates normalized tags case-insensitively", () => {
    expect(
      normalizeTags([" Design ", "design", "Web   Dev", "WEB DEV"]),
    ).toEqual(["Design", "Web Dev"]);
  });

  it("parses comma-separated tag lists with shared normalization", () => {
    expect(parseTagList("React, react, Web   Development")).toEqual([
      "React",
      "Web Development",
    ]);
  });

  it("requires at least one normalized tag when configured", () => {
    expect(validateTags(["  "], { minTags: 1 })).toEqual({
      ok: false,
      error: "At least one tag is required.",
    });
  });

  it("enforces tag length and count limits after normalization", () => {
    expect(validateTags(["x".repeat(51)], { minTags: 1 })).toMatchObject({
      ok: false,
    });
    expect(
      validateTags(["one", "two", "three"], { minTags: 1, maxTags: 2 }),
    ).toEqual({
      ok: false,
      error: "No more than 2 tags are allowed.",
    });
  });
});
