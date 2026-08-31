"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import styles from "./Blog.module.scss";

type Props = {
  availableTags: string[];
  activeTag: string;
  search: string;
  sort: "published" | "updated";
};

const SORT_OPTIONS = [
  { value: "published", label: "Newest" },
  { value: "updated", label: "Recently updated" },
] as const;

/**
 * Filter bar for the blog archive
 */
export default function BlogFilters({
  availableTags,
  activeTag,
  search,
  sort,
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(search);

  // Keep the field in step when visitor navigates back or clears a filter
  useEffect(() => setDraft(search), [search]);

  function navigate(overrides: Record<string, string>) {
    const params = new URLSearchParams();
    const next = { tag: activeTag, search, sort, ...overrides };
    if (next.tag) params.set("tag", next.tag);
    if (next.search) params.set("search", next.search);
    if (next.sort && next.sort !== "published") params.set("sort", next.sort);
    const query = params.toString();
    router.push(query ? `/blog?${query}` : "/blog");
  }

  return (
    <div className={styles.filterBar}>
      <div className={styles.tagRow}>
        <button
          type="button"
          className={`${styles.chip} ${!activeTag ? styles.chipActive : ""}`}
          aria-pressed={!activeTag}
          onClick={() => navigate({ tag: "" })}
        >
          All
        </button>
        {availableTags.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`${styles.chip} ${activeTag === tag ? styles.chipActive : ""}`}
            aria-pressed={activeTag === tag}
            onClick={() => navigate({ tag: activeTag === tag ? "" : tag })}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className={styles.controls}>
        <div className={styles.sortToggle} role="group" aria-label="Sort posts">
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.sortOption} ${sort === option.value ? styles.sortActive : ""}`}
              aria-pressed={sort === option.value}
              onClick={() => navigate({ sort: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>

        <form
          className={styles.searchField}
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ search: draft.trim() });
          }}
        >
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search posts"
            aria-label="Search posts"
            maxLength={100}
          />
          <button type="submit" className={styles.srOnly}>
            Search
          </button>
        </form>
      </div>
    </div>
  );
}
