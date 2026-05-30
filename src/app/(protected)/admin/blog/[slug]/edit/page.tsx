"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import BlogEditor from "@/components/blog/BlogEditor";
import type { BlogTag, BlogStatus } from "@/lib/constants";
import styles from "./EditPost.module.scss";

interface Props {
  params: Promise<{ slug: string }>;
}

export default function EditBlogPostPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPost();
  }, [slug]);

  const fetchPost = async () => {
    try {
      const res = await fetch(`/api/admin/blog/${slug}`);
      if (!res.ok) {
        setError("Post not found.");
        return;
      }
      const data = await res.json();
      setPost(data.post);
    } catch {
      setError("Failed to load post.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data: {
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    tags: BlogTag[];
    status: BlogStatus;
  }) => {
    const res = await fetch(`/api/admin/blog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save.");
    }

    const updated = await res.json();
    // If slug changed (shouldn't normally), redirect
    if (updated.post?.slug && updated.post.slug !== slug) {
      router.push(`/admin/blog/${updated.post.slug}/edit`);
    }
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
        <p className={styles.error}>{error || "Post not found."}</p>
        <BackLink href="/admin/blog" label="Back to Blog Management" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <BackLink href="/admin/blog" label="Back to Blog Management" />
        {post.status === "published" && (
          <Link
            href={`/blog/${slug}`}
            className={styles.viewLink}
            target="_blank"
          >
            View Published Post ↗
          </Link>
        )}
      </div>

      <BlogEditor
        initialData={{
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
          coverImage: post.coverImage,
          tags: post.tags,
          status: post.status,
        }}
        onSave={handleSave}
      />
    </div>
  );
}
