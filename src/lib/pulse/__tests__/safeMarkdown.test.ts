import { describe, expect, it } from "vitest";
import {
  auditMarkdownSafety,
  isSafeUrl,
  sanitizeUrl,
} from "../safeMarkdown";

describe("Safe Markdown URL Policy", () => {
  it("approves safe HTTPS, HTTP, and mailto URLs", () => {
    expect(isSafeUrl("https://codingclub.iitg.ac.in")).toBe(true);
    expect(isSafeUrl("http://example.com/slide")).toBe(true);
    expect(isSafeUrl("mailto:team@codingclub.in")).toBe(true);
    expect(isSafeUrl("#section-heading")).toBe(true);
    expect(isSafeUrl("/internal/dashboard")).toBe(true);
  });

  it("blocks dangerous javascript: pseudoprotocols", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("JAVASCRIPT:fetch('malicious.site')")).toBe(false);
    expect(isSafeUrl("javascript :void(0)")).toBe(false);
  });

  it("blocks vbscript: and data: URIs", () => {
    expect(isSafeUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("sanitizes dangerous URLs by replacing with safe fallback", () => {
    expect(sanitizeUrl("javascript:evil()")).toBe("about:blank#blocked");
    expect(sanitizeUrl("https://safe.org")).toBe("https://safe.org");
  });
});

describe("Safe Markdown Content Safety Audit", () => {
  it("flags raw script tags and inline event handlers", () => {
    const malicious = "Hello <script>alert(1)</script> <img src=x onerror=alert(2) />";
    const audit = auditMarkdownSafety(malicious);
    expect(audit.isSafe).toBe(false);
    expect(audit.warnings.length).toBeGreaterThan(0);
    expect(audit.sanitized).not.toContain("<script>");
    expect(audit.sanitized).not.toContain("onerror=");
  });

  it("passes safe markdown text with math and formatting", () => {
    const safeText = "# Welcome\nCalculate $E=mc^2$ and check [docs](https://ccw.iitg.ac.in).";
    const audit = auditMarkdownSafety(safeText);
    expect(audit.isSafe).toBe(true);
    expect(audit.warnings.length).toBe(0);
  });
});
