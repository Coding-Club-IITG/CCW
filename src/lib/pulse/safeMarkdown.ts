/**
 * Safe Markdown Policy implementation for Pulse slides.
 * Enforces sanitization, safe URL protocol filtering, XSS mitigation,
 * and external link hardening.
 */

import type { SafeMarkdownCheck } from "./types";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Validates whether a URL is safe to use in markdown links and images.
 * Rejects dangerous schemes such as `javascript:`, `vbscript:`, and unsafe `data:`.
 */
export function isSafeUrl(rawUrl: string | undefined | null): boolean {
  if (!rawUrl) return false;
  const trimmed = rawUrl.trim();

  // Allow anchor links and relative paths
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) {
    return true;
  }

  // Detect and reject javascript: or vbscript: anywhere in initial protocol
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("data:")
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    // If URL constructor fails, but does not contain a scheme colon before slashes,
    // consider safe relative link unless it matches pseudo-schemes
    if (!trimmed.includes(":") && !trimmed.startsWith("//")) {
      return true;
    }
    return false;
  }
}

/**
 * Sanitizes a URL for safe rendering.
 * Returns safe fallback if the input contains malicious or unapproved protocols.
 */
export function sanitizeUrl(
  url: string | undefined | null,
  fallback = "about:blank#blocked",
): string {
  if (isSafeUrl(url)) {
    return url!.trim();
  }
  return fallback;
}

/**
 * Scans markdown text against the safe policy and produces warnings
 * if potentially hazardous HTML tags or dangerous schemes are found.
 */
export function auditMarkdownSafety(markdown: string): SafeMarkdownCheck {
  const warnings: string[] = [];
  let isSafe = true;

  // Check for dangerous inline HTML tags
  const dangerousTagRegex =
    /<\s*(script|iframe|object|embed|applet|style|link|form|svg|base)\b[^>]*>/gi;
  if (dangerousTagRegex.test(markdown)) {
    warnings.push("Contains potentially unsafe raw HTML elements.");
    isSafe = false;
  }

  // Check for inline event handlers like onload, onerror, onclick
  const inlineEventRegex = /on[a-z]+\s*=\s*["'][^"']*["']/gi;
  if (inlineEventRegex.test(markdown)) {
    warnings.push("Contains inline JavaScript event handlers.");
    isSafe = false;
  }

  // Check for javascript: pseudoprotocol
  if (/javascript\s*:/i.test(markdown)) {
    warnings.push("Contains dangerous javascript: URI scheme.");
    isSafe = false;
  }

  // Strip dangerous inline script and event handlers
  const sanitized = markdown
    .replace(dangerousTagRegex, "<!-- blocked tag -->")
    .replace(inlineEventRegex, "");

  return {
    isSafe,
    sanitized,
    warnings,
  };
}
