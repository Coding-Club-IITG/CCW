/** Shared shape and URL rules for the public blog archive */

export const POSTS_PER_PAGE = 8;

export const BLOG_SORTS = ["published", "updated"] as const;
export type BlogSort = (typeof BLOG_SORTS)[number];

export type BlogQuery = {
  page?: string;
  tag?: string;
  search?: string;
  sort?: string;
};

export function blogPageNumber(value?: string): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function blogSort(value?: string): BlogSort {
  return BLOG_SORTS.includes(value as BlogSort)
    ? (value as BlogSort)
    : "published";
}

/**
 * Build an archive URL, carrying the active filters through a change to one of them
 */
export function blogHref(query: BlogQuery, overrides: BlogQuery = {}): string {
  const merged = { ...query, ...overrides };
  const params = new URLSearchParams();

  const tag = merged.tag?.trim();
  const search = merged.search?.trim();
  const sort = blogSort(merged.sort);
  const page = blogPageNumber(merged.page);

  if (tag) params.set("tag", tag);
  if (search) params.set("search", search);
  if (sort !== "published") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));

  const queryString = params.toString();
  return queryString ? `/blog?${queryString}` : "/blog";
}
