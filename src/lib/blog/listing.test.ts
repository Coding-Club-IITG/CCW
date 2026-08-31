import { describe, expect, it } from "vitest";

import { blogHref, blogPageNumber, blogSort, POSTS_PER_PAGE } from "./listing";

describe("blogPageNumber", () => {
  it("defaults to page one for missing or invalid input", () => {
    expect(blogPageNumber(undefined)).toBe(1);
    expect(blogPageNumber("")).toBe(1);
    expect(blogPageNumber("abc")).toBe(1);
    expect(blogPageNumber("0")).toBe(1);
    expect(blogPageNumber("-3")).toBe(1);
    expect(blogPageNumber("1e9999")).toBe(1);
  });

  it("accepts a positive page", () => {
    expect(blogPageNumber("4")).toBe(4);
  });
});

describe("blogSort", () => {
  it("falls back to the published order", () => {
    expect(blogSort(undefined)).toBe("published");
    expect(blogSort("nonsense")).toBe("published");
  });

  it("accepts the updated order", () => {
    expect(blogSort("updated")).toBe("updated");
  });
});

describe("blogHref", () => {
  it("returns the bare archive for the default state", () => {
    expect(blogHref({})).toBe("/blog");
    expect(blogHref({ page: "1", sort: "published" })).toBe("/blog");
  });

  it("keeps the other filters when one changes", () => {
    expect(
      blogHref(
        { tag: "Tutorial", search: "git", sort: "updated" },
        { page: "3" },
      ),
    ).toBe("/blog?tag=Tutorial&search=git&sort=updated&page=3");
  });

  it("drops a filter cleared by an override", () => {
    expect(blogHref({ tag: "Tutorial", page: "2" }, { tag: "" })).toBe(
      "/blog?page=2",
    );
  });

  it("encodes values that need it", () => {
    expect(blogHref({ tag: "Machine Learning" })).toBe(
      "/blog?tag=Machine+Learning",
    );
    expect(blogHref({ search: "a&b=c" })).toBe("/blog?search=a%26b%3Dc");
  });

  it("trims surrounding whitespace", () => {
    expect(blogHref({ tag: "  Tutorial  " })).toBe("/blog?tag=Tutorial");
    expect(blogHref({ search: "   " })).toBe("/blog");
  });

  it("paginates at eight posts per page", () => {
    expect(POSTS_PER_PAGE).toBe(8);
  });
});
