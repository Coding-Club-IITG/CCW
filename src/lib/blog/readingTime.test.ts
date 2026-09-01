import { describe, expect, it } from "vitest";

import { countWords, readingMinutes, readingTimeLabel } from "./readingTime";

describe("countWords", () => {
  it("counts plain prose", () => {
    expect(countWords("one two three four five")).toBe(5);
  });

  it("ignores fenced code blocks", () => {
    const markdown = [
      "Intro sentence here.",
      "```ts",
      "const a = 1; const b = 2; const c = 3;",
      "```",
      "Closing sentence.",
    ].join("\n");
    expect(countWords(markdown)).toBe(5);
  });

  it("ignores inline code and link targets but keeps link text", () => {
    expect(
      countWords("See `npm install` in [the guide](https://example.com)"),
    ).toBe(4);
  });

  it("drops image syntax entirely", () => {
    expect(countWords("![a very long alt text](/cover.png) words here")).toBe(
      2,
    );
  });

  it("strips heading markers and emphasis", () => {
    expect(countWords("## Heading here\n\n**bold** and _italic_")).toBe(5);
  });

  it("returns zero for empty or whitespace-only content", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n\n  ")).toBe(0);
    expect(countWords("```\ncode only\n```")).toBe(0);
  });
});

describe("readingMinutes", () => {
  it("rounds to the nearest minute", () => {
    // 220 words per minute, so 330 words rounds to 2.
    expect(readingMinutes("word ".repeat(330))).toBe(2);
    expect(readingMinutes("word ".repeat(220))).toBe(1);
  });

  it("never reports zero minutes for a post with content", () => {
    expect(readingMinutes("a short post")).toBe(1);
  });

  it("reports zero only when there is nothing to read", () => {
    expect(readingMinutes("")).toBe(0);
  });
});

describe("readingTimeLabel", () => {
  it("formats the estimate", () => {
    expect(readingTimeLabel("word ".repeat(1540))).toBe("7 min read");
  });

  it("is empty when there is no content", () => {
    expect(readingTimeLabel("")).toBe("");
  });
});
