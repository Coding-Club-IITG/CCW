"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink as IconExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

import { expectAppData } from "@/lib/api/result";
import type { BlogStatus } from "@/lib/constants";

import BackLink from "@/components/shared/BackLink";
import Pagination from "@/components/shared/Pagination";
import { TableSkeletonContent } from "@/components/shared/skeletons/TableSkeleton";

import styles from "./AdminBlog.module.scss";
import AdminBlogLoading from "./loading";

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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const router = useRouter();

  useEffect(() => {
    async function fetchPosts() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/blog?page=${page}&limit=20`);
        const json = await expectAppData(res);
        setPosts(json.items || []);
        setTotalPages(json.pagination?.totalPages || 1);
      } catch {
        setPosts([]);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    }

    void fetchPosts();
  }, [page]);

  const handleDelete = async (slug: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      const response = await fetch(`/api/admin/blog/${slug}`, {
        method: "DELETE",
      });
      await expectAppData(response);
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
      const data = await expectAppData(res);
      if (data.post?.slug) {
        router.push(`/admin/blog/${data.post.slug}/edit`);
      }
    } catch {
      alert("Failed to create post.");
    }
  };

  if (loading && posts.length === 0) return <AdminBlogLoading />;

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
        <TableSkeletonContent label="blog posts" columns={4} />
      ) : posts.length === 0 ? (
        <div className={styles.empty}>
          <p>No blog posts yet. Create your first post to get started.</p>
        </div>
      ) : (
        <>
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
                      View <IconExternalLink width={12} height={12} />
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
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
