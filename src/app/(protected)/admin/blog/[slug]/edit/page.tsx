"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ExternalLink as IconExternalLink } from "lucide-react";

import { expectAppData } from "@/lib/api/result";
import type { BlogStatus } from "@/lib/constants";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";

import BlogEditor from "@/components/blog/BlogEditor";
import BackLink from "@/components/shared/BackLink";

import styles from "./EditPost.module.scss";
import { FormSkeletonContent } from "@/components/shared/skeletons/FormSkeleton";

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
    async function fetchPost() {
      try {
        const res = await fetch(`/api/admin/blog/${slug}`);
        const data = await expectAppData(res);
        setPost(data.post);
      } catch {
        setError("Failed to load post.");
      } finally {
        setLoading(false);
      }
    }

    void fetchPost();
  }, [slug]);

  const handleSave = async (data: {
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    coverFocalPoint: ImageFocalPoint;
    tags: string[];
    status: BlogStatus;
    authors: { userId: string; name: string }[];
  }) => {
    const res = await fetch(`/api/admin/blog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const updated = await expectAppData(res);
    // If slug changed (shouldn't normally), redirect
    if (updated.post?.slug && updated.post.slug !== slug) {
      router.push(`/admin/blog/${updated.post.slug}/edit`);
    }
  };

  if (loading) {
    return (
      <div>
        <div className={styles.topBar}>
          <BackLink href="/admin/blog" label="Back to Blog Management" />
        </div>
        <FormSkeletonContent label="the editor" fields={5} />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div>
        <p className={styles.error}>{error || "Post not found."}</p>
        <BackLink href="/admin/blog" label="Back to Blog Management" />
      </div>
    );
  }

  return (
    <div>
      <div className={styles.topBar}>
        <BackLink href="/admin/blog" label="Back to Blog Management" />
        {post.status === "published" && (
          <Link
            href={`/blog/${slug}`}
            className={styles.viewLink}
            target="_blank"
            rel="noreferrer"
          >
            View Published Post <IconExternalLink width={12} height={12} />
          </Link>
        )}
      </div>

      <BlogEditor
        initialData={{
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
          coverImage: post.coverImage,
          coverFocalPoint: post.coverFocalPoint,
          tags: post.tags,
          status: post.status,
          authors: post.authors || [],
        }}
        onSave={handleSave}
      />
    </div>
  );
}
