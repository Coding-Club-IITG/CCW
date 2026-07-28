"use client";

import { use, useEffect, useState } from "react";
import BackLink from "@/components/shared/BackLink";
import BlogEditor from "@/components/blog/BlogEditor";
import type { BlogStatus } from "@/lib/constants";
import styles from "./EditBlog.module.scss";

interface Props {
  params: Promise<{ slug: string }>;
}

interface EditablePost {
  title: string;
  content: string;
  excerpt: string;
  coverImage: string;
  tags: string[];
  status: BlogStatus;
  authors: { userId: string; name: string }[];
}

export default function EditMyBlogPage({ params }: Props) {
  const { slug } = use(params);
  const [post, setPost] = useState<EditablePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      try {
        const response = await fetch(`/api/internal/blog/${slug}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to load blog.");
        }
        if (!cancelled) setPost(data.post);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load blog.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchPost();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleSave = async (data: {
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    tags: string[];
    status: BlogStatus;
    authors: { userId: string; name: string }[];
  }) => {
    const response = await fetch(`/api/internal/blog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        content: data.content,
        excerpt: data.excerpt,
        coverImage: data.coverImage,
        tags: data.tags,
      }),
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Failed to save blog.");
    }

    setPost(result.post);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>Loading...</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className={styles.container}>
        <p className={styles.error}>{error || "Blog not found."}</p>
        <BackLink href="/internal/dashboard" label="Back to Dashboard" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <BackLink href="/internal/dashboard" label="Back to My Blogs" />
      </div>
      <BlogEditor
        initialData={post}
        onSave={handleSave}
        canManageAuthors={false}
        canManageStatus={false}
        uploadEndpoint={`/api/internal/blog/upload-image?slug=${encodeURIComponent(slug)}`}
      />
    </div>
  );
}
