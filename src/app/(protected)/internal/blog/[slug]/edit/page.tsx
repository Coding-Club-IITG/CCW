"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink as IconExternalLink } from "lucide-react";

import { expectAppData } from "@/lib/api/result";
import type { BlogStatus } from "@/lib/constants";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import BlogEditor, { BlogEditorData } from "@/components/blog/BlogEditor";
import BackLink from "@/components/shared/BackLink";

import styles from "./EditBlog.module.scss";
import { FormSkeletonContent } from "@/components/shared/skeletons/FormSkeleton";

interface Props {
  params: Promise<{ slug: string }>;
}

interface EditablePost {
  title: string;
  content: string;
  excerpt: string;
  coverImage: string;
  coverFocalPoint?: ImageFocalPoint;
  tags: string[];
  status: BlogStatus;
  authors: { userId: string; name: string }[];
  pendingRevision?: {
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    coverFocalPoint?: ImageFocalPoint;
    tags: string[];
    updatedAt: string;
    submittedAt: string | null;
    submittedBy: string;
  } | null;
}

export default function EditMyBlogPage({ params }: Props) {
  const { slug } = use(params);
  const [post, setPost] = useState<EditablePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      try {
        const response = await fetch(`/api/internal/blog/${slug}`);
        const data = await expectAppData(response);
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

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 5000);
  };

  const handleSave = async (data: BlogEditorData, requestApproval = false) => {
    const response = await fetch(`/api/internal/blog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: data.title,
        content: data.content,
        excerpt: data.excerpt,
        coverImage: data.coverImage,
        coverFocalPoint: data.coverFocalPoint,
        tags: data.tags,
        requestApproval,
      }),
    });
    const result = await expectAppData(response);
    setPost(result.post);
    showToast(
      requestApproval
        ? "Changes submitted for approval! An administrator will review and publish them."
        : isPublished
          ? "Draft revision saved successfully."
          : "Draft saved successfully.",
    );
  };

  const handleDiscardRevision = async () => {
    if (
      !confirm(
        "Are you sure you want to discard your unapproved draft changes? This will revert your working editor to the live published post.",
      )
    ) {
      return;
    }
    try {
      const response = await fetch(`/api/internal/blog/${slug}`, {
        method: "DELETE",
      });
      const result = await expectAppData(response);
      setPost(result.post);
      showToast("Draft revision discarded. Reverted to live published content.");
    } catch {
      alert("Failed to discard revision.");
    }
  };

  if (loading) {
    return (
      <div>
        <div className={styles.topBar}>
          <BackLink href="/internal/dashboard" label="Back to My Blogs" />
        </div>
        <FormSkeletonContent label="the editor" fields={5} />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div>
        <p className={styles.error}>{error || "Blog not found."}</p>
        <BackLink href="/internal/dashboard" label="Back to Dashboard" />
      </div>
    );
  }

  const isPublished = post.status === "published";
  const hasRevision = Boolean(post.pendingRevision);
  const isSubmitted = Boolean(post.pendingRevision?.submittedAt);

  // Use pendingRevision if available, otherwise live fields
  const initialEditorData = isPublished && post.pendingRevision
    ? {
        title: post.pendingRevision.title,
        content: post.pendingRevision.content,
        excerpt: post.pendingRevision.excerpt,
        coverImage: post.pendingRevision.coverImage,
        coverFocalPoint: post.pendingRevision.coverFocalPoint,
        tags: post.pendingRevision.tags,
        status: post.status,
        authors: post.authors,
      }
    : {
        title: post.title,
        content: post.content,
        excerpt: post.excerpt,
        coverImage: post.coverImage,
        coverFocalPoint: post.coverFocalPoint,
        tags: post.tags,
        status: post.status,
        authors: post.authors,
      };

  return (
    <div>
      <div className={styles.topBar}>
        <BackLink href="/internal/dashboard" label="Back to My Blogs" />
        {isPublished && (
          <Link
            href={`/blog/${slug}`}
            className={styles.viewLink}
            target="_blank"
          >
            View Live Post <IconExternalLink width={14} height={14} />
          </Link>
        )}
      </div>

      {toastMessage && (
        <div className={`${styles.banner} ${styles.submitted}`}>
          <span className={styles.bannerTitle}>{toastMessage}</span>
        </div>
      )}

      {isPublished && (
        <div
          className={`${styles.banner} ${
            isSubmitted
              ? styles.submitted
              : hasRevision
                ? styles.draftRevision
                : ""
          }`}
        >
          <span className={styles.bannerTitle}>
            {isSubmitted
              ? "Changes Pending Review"
              : hasRevision
                ? "Draft Changes Saved (Staging)"
                : "Editing Published Article"}
          </span>
          <p className={styles.bannerText}>
            {isSubmitted
              ? `You requested approval to publish these updates on ${new Date(
                  post.pendingRevision!.submittedAt!,
                ).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}. The live article remains online and unchanged until an administrator reviews and approves.`
              : hasRevision
                ? "You have saved draft updates. The live article remains online unchanged. Click 'Request Approval to Publish' when your changes are ready for review."
                : "This article is currently live. Any changes you make will be saved as a staged draft revision and will not affect the live website until approved by an administrator."}
          </p>
          {hasRevision && (
            <div className={styles.bannerActions}>
              <button
                type="button"
                className={styles.btnDangerSmall}
                onClick={handleDiscardRevision}
              >
                Discard Staged Changes
              </button>
            </div>
          )}
        </div>
      )}

      <BlogEditor
        key={
          post.pendingRevision
            ? `rev-${post.pendingRevision.updatedAt}`
            : `live-${post.status}`
        }
        initialData={initialEditorData}
        onSave={(data) => handleSave(data, false)}
        saveButtonLabel={isPublished ? "Save Draft Revision" : "Save Changes"}
        secondaryButton={
          isPublished
            ? {
                label: "Request Approval to Publish",
                onClick: (data) => handleSave(data, true),
                variant: "primary",
              }
            : undefined
        }
        canManageAuthors={false}
        canManageStatus={false}
        uploadEndpoint={`/api/internal/blog/upload-image?slug=${encodeURIComponent(slug)}`}
      />
    </div>
  );
}

