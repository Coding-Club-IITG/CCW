import { describe, expect, it } from "vitest";
import {
  calculateReadingProgress,
  findActiveHeading,
  isArticleTextSize,
  writeClipboardText,
} from "./articleReader";

describe("article reader utilities", () => {
  it("clamps reading progress to the article", () => {
    const input = {
      articleTop: 200,
      articleHeight: 2000,
      viewportHeight: 800,
    };
    expect(calculateReadingProgress({ ...input, scrollY: 0 })).toBe(0);
    expect(calculateReadingProgress({ ...input, scrollY: 800 })).toBe(0.5);
    expect(calculateReadingProgress({ ...input, scrollY: 2000 })).toBe(1);
  });

  it("tracks the last heading above the reading threshold", () => {
    const headings = [
      { id: "one", top: -200 },
      { id: "two", top: 100 },
      { id: "three", top: 500 },
    ];
    expect(findActiveHeading(headings, 140)).toBe("two");
    expect(findActiveHeading([], 140)).toBeNull();
  });

  it("accepts only supported persisted text sizes", () => {
    expect(isArticleTextSize("small")).toBe(true);
    expect(isArticleTextSize("default")).toBe(true);
    expect(isArticleTextSize("large")).toBe(true);
    expect(isArticleTextSize("huge")).toBe(false);
  });

  it("writes copy text and exposes clipboard failures", async () => {
    const writes: string[] = [];
    await writeClipboardText("copied value", {
      writeText: async (value) => {
        writes.push(value);
      },
    });
    expect(writes).toEqual(["copied value"]);

    await expect(writeClipboardText("value", undefined)).rejects.toThrow(
      "Clipboard access is unavailable",
    );
    await expect(
      writeClipboardText("value", {
        writeText: async () => {
          throw new Error("permission denied");
        },
      }),
    ).rejects.toThrow("permission denied");
  });
});
