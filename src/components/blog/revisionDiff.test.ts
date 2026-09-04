import { describe, expect, it } from "vitest";

import { computeLineDiff, prepareLineDiff } from "./revisionDiff";

describe("revision line diff", () => {
  it("preserves line numbers around a replacement", () => {
    expect(
      computeLineDiff("alpha\nbeta\ngamma", "alpha\ndelta\ngamma"),
    ).toEqual([
      {
        type: "unchanged",
        text: "alpha",
        oldLineNumber: 1,
        newLineNumber: 1,
      },
      { type: "removed", text: "beta", oldLineNumber: 2 },
      { type: "added", text: "delta", newLineNumber: 2 },
      {
        type: "unchanged",
        text: "gamma",
        oldLineNumber: 3,
        newLineNumber: 3,
      },
    ]);
  });

  it("uses a linear fallback for large comparisons", () => {
    const oldLines = [
      "same",
      ...Array.from({ length: 600 }, (_, i) => `old-${i}`),
      "end",
    ];
    const newLines = [
      "same",
      ...Array.from({ length: 600 }, (_, i) => `new-${i}`),
      "end",
    ];

    const diff = computeLineDiff(oldLines.join("\n"), newLines.join("\n"));

    expect(diff).toHaveLength(1202);
    expect(diff[0]).toMatchObject({
      type: "unchanged",
      oldLineNumber: 1,
      newLineNumber: 1,
    });
    expect(diff.at(-1)).toMatchObject({
      type: "unchanged",
      oldLineNumber: 602,
      newLineNumber: 602,
    });
  });

  it("collapses context and caps the rendered line count", () => {
    const unchanged = Array.from({ length: 20 }, (_, index) => ({
      type: "unchanged" as const,
      text: `line-${index}`,
      oldLineNumber: index + 1,
      newLineNumber: index + 1,
    }));
    const collapsed = prepareLineDiff([
      ...unchanged.slice(0, 10),
      { type: "removed", text: "old", oldLineNumber: 11 } as const,
      { type: "added", text: "new", newLineNumber: 11 } as const,
      ...unchanged.slice(10),
    ]);
    expect(collapsed.filter((line) => line.type === "omitted")).toHaveLength(2);

    const largeReplacement = prepareLineDiff([
      ...Array.from({ length: 600 }, (_, index) => ({
        type: "removed" as const,
        text: `old-${index}`,
        oldLineNumber: index + 1,
      })),
      ...Array.from({ length: 600 }, (_, index) => ({
        type: "added" as const,
        text: `new-${index}`,
        newLineNumber: index + 1,
      })),
    ]);
    expect(largeReplacement.length).toBeLessThanOrEqual(800);
    expect(largeReplacement.some((line) => line.type === "omitted")).toBe(true);
  });
});
