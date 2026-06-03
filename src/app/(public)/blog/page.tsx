"use client";

import { useState, useEffect } from "react";
import SearchInput from "@/components/shared/SearchInput";
import BlogCard from "@/components/blog/BlogCard";
import TagBadge from "@/components/blog/TagBadge";
import styles from "./Blog.module.scss";

interface BlogAuthor {
  userId: string;
  name: string;
}

interface Post {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage?: string;
  authors: BlogAuthor[];
  tags: string[];
  publishedAt: string;
  updatedAt?: string;
}

export default function BlogPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchPosts();
  }, [activeTag, search, page]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "12" });
      if (activeTag) params.set("tag", activeTag);
      if (search) params.set("search", search);

      const res = await fetch(`/api/blog?${params}`);
      const data = await res.json();
      setPosts(data.items || []);
      setTotalPages(data.pagination?.totalPages || 1);
      if (data.availableTags) {
        setAvailableTags(data.availableTags);
      }
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTagFilter = (tag: string) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
    setPage(1);
  };

  const handleSearch = (value: string) => {
    setSearch(value.trim());
    setPage(1);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Blog</h1>
        <p className={styles.subtitle}>
          Insights, tutorials, and updates from the Coding Club IITG community.
        </p>
        <SearchInput
          placeholder="Search posts by title"
          onSearch={handleSearch}
          className={styles.searchInput}
        />
      </header>

      {availableTags.length > 0 && (
        <div className={styles.filters}>
          {availableTags.map((tag) => (
            <TagBadge
              key={tag}
              tag={tag}
              active={activeTag === tag}
              onClick={() => handleTagFilter(tag)}
            />
          ))}
        </div>
      )}

      {loading ? (
        <div className={styles.loading}>Loading posts...</div>
      ) : posts.length === 0 ? (
        <div className={styles.empty}>
          <p>
            No posts found
            {activeTag ? ` for tag "${activeTag}"` : ""}
            {search ? `${activeTag ? " and" : " for"} search "${search}"` : ""}.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {posts.map((post) => (
              <BlogCard
                key={post._id}
                slug={post.slug}
                title={post.title}
                excerpt={post.excerpt}
                coverImage={post.coverImage}
                authors={post.authors}
                tags={post.tags}
                publishedAt={post.publishedAt}
                updatedAt={post.updatedAt}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className={styles.pageInfo}>
                Page {page} of {totalPages}
              </span>
              <button
                className={styles.pageBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
