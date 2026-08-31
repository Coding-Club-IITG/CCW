import { describe, expect, it } from "vitest";

import { boundedLine, boundedTitle, fitTitle, titleFontSize } from "./route";

describe("boundedTitle", () => {
  it("falls back to the site name when empty", () => {
    expect(boundedTitle(null)).toBe("Coding Club IITG");
    expect(boundedTitle("   ")).toBe("Coding Club IITG");
  });

  it("strips control characters and collapses whitespace", () => {
    expect(boundedTitle("  \u0000 Hello   world ")).toBe("Hello world");
    expect(boundedTitle("Level Up\tYour   Terminal\n#1")).toBe(
      "Level Up Your Terminal #1",
    );
  });

  it("caps at 120 characters without splitting surrogate pairs", () => {
    expect(boundedTitle("a".repeat(200))).toHaveLength(120);

    const emoji = boundedTitle("\u{1F680}".repeat(140));
    expect(Array.from(emoji)).toHaveLength(120);
    expect(emoji.endsWith("\u{1F680}")).toBe(true);
  });
});

describe("boundedLine", () => {
  it("returns an empty string for missing values so callers can default", () => {
    expect(boundedLine(undefined)).toBe("");
    expect(boundedLine(null)).toBe("");
  });

  it("respects the supplied limit", () => {
    expect(boundedLine("Machine Learning", 7)).toBe("Machine");
  });
});

describe("titleFontSize", () => {
  it("uses the display size for short titles", () => {
    expect(titleFontSize("The heartbeat of technology")).toBe(74);
  });

  it("steps down past the long-title threshold", () => {
    expect(titleFontSize("a".repeat(41))).toBe(60);
  });
});

describe("fitTitle", () => {
  it("leaves a title that fits the column untouched", () => {
    const title = "Meet CourseHub: Find, Share, and Organise Course Material";
    expect(fitTitle(title)).toBe(title);
  });

  it("breaks on a word boundary and ellipsizes an overlong title", () => {
    const fitted = fitTitle(
      "Evolution of Word Embeddings: From Static to Contextual Representations",
    );
    expect(fitted).toBe(
      "Evolution of Word Embeddings: From Static to Contextual…",
    );
    expect(fitted.endsWith(" …")).toBe(false);
  });

  it("hard-cuts when there is no late word boundary to break on", () => {
    const fitted = fitTitle("x".repeat(200));
    expect(fitted).toBe(`${"x".repeat(62)}…`);
  });
});
