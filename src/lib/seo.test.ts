import { describe, expect, it } from "vitest";
import { absoluteUrl, plainText, safeJsonLd } from "./seo";

describe("SEO helpers", () => {
  it("resolves local media against the canonical host", () => {
    expect(absoluteUrl("/api/events/assets/poster.png")).toBe(
      "https://codingclub.in/api/events/assets/poster.png",
    );
    expect(absoluteUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("creates bounded plain-text descriptions", () => {
    expect(plainText("# A **useful** post", "fallback", 20)).toBe(
      "A useful post",
    );
  });

  it("prevents JSON-LD script termination", () => {
    const json = safeJsonLd({ title: "</script><script>alert(1)</script>" });
    expect(json).not.toContain("<");
    expect(JSON.parse(json)).toEqual({
      title: "</script><script>alert(1)</script>",
    });
  });
});
