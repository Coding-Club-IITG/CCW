"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BlogCard from "@/components/blog/BlogCard";
import TagBadge from "@/components/blog/TagBadge";
import SearchInput from "@/components/shared/SearchInput";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import styles from "./Blog.module.scss";

interface Post {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage?: string;
  coverFocalPoint?: ImageFocalPoint;
  authors: { userId: string; name: string }[];
  tags: string[];
  publishedAt: string;
  updatedAt?: string;
}
export interface BlogListingData {
  items: Post[];
  availableTags: string[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export default function BlogExplorer({
  initialData,
  initialQuery,
}: {
  initialData: BlogListingData;
  initialQuery: { page?: string; tag?: string; search?: string };
}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [activeTag, setActiveTag] = useState(initialQuery.tag?.trim() || "");
  const [search, setSearch] = useState(initialQuery.search?.trim() || "");
  const [searchInput, setSearchInput] = useState(search);
  const [page, setPage] = useState(initialData.pagination.page);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), limit: "12" });
    if (activeTag) params.set("tag", activeTag);
    if (search) params.set("search", search);
    setLoading(true);
    window.history.replaceState(null, "", `/blog?${params}`);
    fetch(`/api/blog?${params}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((next) => setData(next))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setData((current) => ({ ...current, items: [] }));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [activeTag, page, search]);

  function setTag(tag: string) {
    setActiveTag((current) => (current === tag ? "" : tag));
    setPage(1);
  }
  function setSearchValue(value: string) {
    setSearch(value.trim());
    setPage(1);
  }
  const filtered = Boolean(activeTag || search);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Blog</h1>
        <p className={styles.subtitle}>
          Insights, tutorials, and updates from the Coding Club IITG community.
        </p>
        <SearchInput
          placeholder="Search posts by title"
          value={searchInput}
          onChange={setSearchInput}
          onSearch={setSearchValue}
          className={styles.searchInput}
        />
      </header>
      {data.availableTags.length > 0 && (
        <div className={styles.filters}>
          {data.availableTags.map((tag) => (
            <TagBadge
              key={tag}
              tag={tag}
              active={activeTag === tag}
              onClick={() => setTag(tag)}
            />
          ))}
        </div>
      )}
      {loading ? (
        <div className={styles.loading}>Loading posts...</div>
      ) : data.items.length === 0 ? (
        <div className={styles.empty}>
          <p>
            No posts found{activeTag ? ` for tag "${activeTag}"` : ""}
            {search ? `${activeTag ? " and" : " for"} search "${search}"` : ""}.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {data.items.map((post) => (
              <BlogCard key={post._id} {...post} />
            ))}
          </div>
          {data.pagination.totalPages > 1 && (
            <nav className={styles.pagination} aria-label="Blog pagination">
              {filtered ? (
                <button
                  className={styles.pageBtn}
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Previous
                </button>
              ) : page <= 1 ? (
                <button className={styles.pageBtn} disabled>
                  Previous
                </button>
              ) : (
                <Link
                  className={styles.pageBtn}
                  href={page === 2 ? "/blog" : `/blog?page=${page - 1}`}
                >
                  Previous
                </Link>
              )}
              <span className={styles.pageInfo}>
                Page {page} of {data.pagination.totalPages}
              </span>
              {filtered ? (
                <button
                  className={styles.pageBtn}
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </button>
              ) : page >= data.pagination.totalPages ? (
                <button className={styles.pageBtn} disabled>
                  Next
                </button>
              ) : (
                <Link
                  className={styles.pageBtn}
                  href={`/blog?page=${page + 1}`}
                >
                  Next
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
