import { describe, expect, it } from "vitest";
import { findUniqueSlug, titleToSlug } from "./slug";

describe("titleToSlug", () => {
  it("preserves the established blog normalization", () => {
    expect(titleToSlug("  Hello, WORLD!! -- Next.js  ")).toBe(
      "hello-world-nextjs",
    );
    expect(titleToSlug("नमस्ते 🚀")).toBe("");
    expect(titleToSlug("a".repeat(120))).toHaveLength(100);
  });

  it("adds deterministic collision suffixes", async () => {
    const used = new Set(["event", "event-2"]);
    await expect(
      findUniqueSlug("event", async (slug) => used.has(slug)),
    ).resolves.toBe("event-3");
  });
});
