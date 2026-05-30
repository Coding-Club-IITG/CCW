"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BackLink from "@/components/BackLink";
import type { BlogStatus } from "@/lib/constants";
import styles from "./AdminBlog.module.scss";

interface Post {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  status: BlogStatus;
  authors: { userId: string; name: string }[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const res = await fetch("/api/admin/blog");
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (slug: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      await fetch(`/api/admin/blog/${slug}`, { method: "DELETE" });
      setPosts((prev) => prev.filter((p) => p.slug !== slug));
    } catch {
      alert("Failed to delete post.");
    }
  };

  const handleNew = async () => {
    try {
      const res = await fetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Untitled Post",
          content: "",
          excerpt: "",
          tags: [],
          status: "draft",
        }),
      });
      const data = await res.json();
      if (data.post?.slug) {
        router.push(`/admin/blog/${data.post.slug}/edit`);
      }
    } catch {
      alert("Failed to create post.");
    }
  };

  return (
    <div className={styles.container}>
      <BackLink href="/admin" label="Back to Administration" />

      <header className={styles.header}>
        <div>
          <h1>Blog Management</h1>
          <p>Create, edit, and manage blog posts.</p>
        </div>
        <button className={styles.btnPrimary} onClick={handleNew}>
          New Post
        </button>
      </header>

      {loading ? (
        <p className={styles.loading}>Loading...</p>
      ) : posts.length === 0 ? (
        <div className={styles.empty}>
          <p>No blog posts yet. Create your first post to get started.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {posts.map((post) => (
            <div key={post._id} className={styles.row}>
              <div className={styles.rowInfo}>
                <Link
                  href={`/admin/blog/${post.slug}/edit`}
                  className={styles.rowTitle}
                >
                  {post.title}
                </Link>
                <div className={styles.rowMeta}>
                  <span
                    className={`${styles.statusBadge} ${post.status === "published" ? styles.published : styles.draft}`}
                  >
                    {post.status}
                  </span>
                  <span className={styles.rowAuthor}>
                    {post.authors?.map((a) => a.name).join(", ") || "Unknown"}
                  </span>
                  <span className={styles.rowDate}>
                    {new Date(
                      post.publishedAt || post.createdAt,
                    ).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <div className={styles.rowActions}>
                <Link
                  href={`/admin/blog/${post.slug}/edit`}
                  className={styles.btnSecondary}
                >
                  Edit
                </Link>
                {post.status === "published" && (
                  <Link
                    href={`/blog/${post.slug}`}
                    className={styles.btnSecondary}
                    target="_blank"
                  >
                    View
                  </Link>
                )}
                <button
                  className={styles.btnDanger}
                  onClick={() => handleDelete(post.slug)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
