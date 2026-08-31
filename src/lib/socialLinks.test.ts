import { describe, expect, it } from "vitest";

import { githubProfileUrl, normalizeLinkedInUrl } from "./socialLinks";

describe("githubProfileUrl", () => {
  it("builds a profile URL from a handle", () => {
    expect(githubProfileUrl("maydayv7")).toBe("https://github.com/maydayv7");
  });

  it("returns null for absent or blank handles", () => {
    expect(githubProfileUrl(undefined)).toBeNull();
    expect(githubProfileUrl(null)).toBeNull();
    expect(githubProfileUrl("   ")).toBeNull();
  });

  it("rejects handles that could escape the path", () => {
    expect(githubProfileUrl("foo/bar")).toBeNull();
    expect(githubProfileUrl("../evil")).toBeNull();
    expect(githubProfileUrl("a b")).toBeNull();
    expect(githubProfileUrl("x".repeat(51))).toBeNull();
  });
});

describe("normalizeLinkedInUrl", () => {
  it("accepts a company or member profile URL", () => {
    expect(normalizeLinkedInUrl("https://linkedin.com/in/someone")).toBe(
      "https://linkedin.com/in/someone",
    );
    expect(
      normalizeLinkedInUrl("https://www.linkedin.com/company/coding-club-iitg"),
    ).toBe("https://www.linkedin.com/company/coding-club-iitg");
  });

  it("accepts regional subdomains", () => {
    expect(normalizeLinkedInUrl("https://in.linkedin.com/in/someone")).toBe(
      "https://in.linkedin.com/in/someone",
    );
  });

  it("strips query strings, fragments and a trailing slash", () => {
    expect(
      normalizeLinkedInUrl("https://linkedin.com/in/someone/?utm=x#top"),
    ).toBe("https://linkedin.com/in/someone");
  });

  it("rejects other hosts, including lookalikes", () => {
    expect(normalizeLinkedInUrl("https://example.com/in/someone")).toBeNull();
    expect(normalizeLinkedInUrl("https://notlinkedin.com/in/x")).toBeNull();
    expect(
      normalizeLinkedInUrl("https://linkedin.com.evil.tld/in/x"),
    ).toBeNull();
  });

  it("rejects non-https schemes", () => {
    expect(normalizeLinkedInUrl("http://linkedin.com/in/someone")).toBeNull();
    expect(
      normalizeLinkedInUrl("javascript:alert(document.domain)"),
    ).toBeNull();
  });

  it("rejects a bare host with no profile path", () => {
    expect(normalizeLinkedInUrl("https://linkedin.com")).toBeNull();
    expect(normalizeLinkedInUrl("https://linkedin.com/")).toBeNull();
  });

  it("returns null for absent, blank or unparseable values", () => {
    expect(normalizeLinkedInUrl(undefined)).toBeNull();
    expect(normalizeLinkedInUrl("")).toBeNull();
    expect(normalizeLinkedInUrl("not a url")).toBeNull();
    expect(
      normalizeLinkedInUrl(`https://linkedin.com/in/${"x".repeat(200)}`),
    ).toBeNull();
  });
});
