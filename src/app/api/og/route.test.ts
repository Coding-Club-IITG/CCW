import { describe, expect, it } from "vitest";
import { boundedTitle } from "./route";

describe("Open Graph title normalization", () => {
  it("handles empty, control, Unicode, and long input", () => {
    expect(boundedTitle("  \u0000 Hello   world ")).toBe("Hello world");
    expect(boundedTitle(null)).toBe("Coding Club IITG");
    const unicode = "🚀".repeat(140);
    const result = boundedTitle(unicode);
    expect(Array.from(result)).toHaveLength(120);
    expect(result.endsWith("🚀")).toBe(true);
  });
});
