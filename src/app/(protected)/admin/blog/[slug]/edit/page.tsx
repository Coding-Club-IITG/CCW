"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { ExternalLink as IconExternalLink, Check, X as IconX } from "lucide-react";

import { expectAppData } from "@/lib/api/result";
import type { BlogStatus } from "@/lib/constants";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import BlogEditor, { BlogEditorData } from "@/components/blog/BlogEditor";
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
  const [actionLoading, setActionLoading] = useState(false);
  const [viewingMode, setViewingMode] = useState<"live" | "revision">("revision");

  useEffect(() => {
    async function fetchPost() {
      try {
        const res = await fetch(`/api/admin/blog/${slug}`);
        const data = await expectAppData(res);
        setPost(data.post);
        if (data.post?.pendingRevision) {
          setViewingMode("revision");
        } else {
          setViewingMode("live");
        }
      } catch {
        setError("Failed to load post.");
      } finally {
        setLoading(false);
      }
    }

    void fetchPost();
  }, [slug]);

  const handleSave = async (data: BlogEditorData) => {
    const res = await fetch(`/api/admin/blog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const updated = await expectAppData(res);
    setPost(updated.post);
    if (updated.post?.slug && updated.post.slug !== slug) {
      router.push(`/admin/blog/${updated.post.slug}/edit`);
    }
  };

  const handleApproveRevision = async () => {
    if (
      !confirm(
        "Are you sure you want to approve and publish these changes to the live blog?",
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/blog/${slug}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const data = await expectAppData(res);
      setPost(data.post);
      setViewingMode("live");
      alert("Changes have been approved and published to the live website!");
    } catch {
      alert("Failed to approve revision.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRevision = async () => {
    if (
      !confirm(
        "Are you sure you want to reject and discard these proposed changes?",
      )
    ) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/blog/${slug}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      });
      const data = await expectAppData(res);
      setPost(data.post);
      setViewingMode("live");
      alert("Proposed changes have been discarded.");
    } catch {
      alert("Failed to reject revision.");
    } finally {
      setActionLoading(false);
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

  const hasRevision = Boolean(post.pendingRevision);
  const isSubmitted = Boolean(post.pendingRevision?.submittedAt);

  const activeEditorData =
    hasRevision && viewingMode === "revision"
      ? {
          title: post.pendingRevision.title,
          content: post.pendingRevision.content,
          excerpt: post.pendingRevision.excerpt,
          coverImage: post.pendingRevision.coverImage,
          coverFocalPoint: post.pendingRevision.coverFocalPoint,
          tags: post.pendingRevision.tags,
          status: post.status,
          authors: post.authors || [],
        }
      : {
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
          coverImage: post.coverImage,
          coverFocalPoint: post.coverFocalPoint,
          tags: post.tags,
          status: post.status,
          authors: post.authors || [],
        };

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
            View Live Post <IconExternalLink width={14} height={14} />
          </Link>
        )}
      </div>

      {hasRevision && (
        <div className={styles.revisionBanner}>
          <div className={styles.revisionBannerHeader}>
            <div className={styles.revisionBannerTitle}>
              <span>Proposed Changes Pending Review</span>
              <span className={styles.revisionBannerBadge}>
                {isSubmitted ? "Review Requested" : "Draft Staged"}
              </span>
            </div>
            <div className={styles.revisionActions}>
              <button
                type="button"
                className={styles.btnSuccess}
                onClick={handleApproveRevision}
                disabled={actionLoading}
              >
                <Check width={14} height={14} style={{ display: "inline", marginRight: "4px" }} />
                Approve & Publish Changes
              </button>
              <button
                type="button"
                className={styles.btnDanger}
                onClick={handleRejectRevision}
                disabled={actionLoading}
              >
                <IconX width={14} height={14} style={{ display: "inline", marginRight: "4px" }} />
                Reject Changes
              </button>
            </div>
          </div>
          <p className={styles.revisionBannerDesc}>
            An author submitted updates to this published post on{" "}
            {post.pendingRevision.submittedAt
              ? new Date(post.pendingRevision.submittedAt).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : new Date(post.pendingRevision.updatedAt).toLocaleString("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
            . Use the toggle below to compare the live version with the proposed revision.
          </p>
          <div className={styles.modeToggle}>
            <button
              type="button"
              className={`${styles.modeBtn} ${viewingMode === "revision" ? styles.active : ""}`}
              onClick={() => setViewingMode("revision")}
            >
              Proposed Revision (Staged)
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${viewingMode === "live" ? styles.active : ""}`}
              onClick={() => setViewingMode("live")}
            >
              Current Live Version
            </button>
          </div>
        </div>
      )}

      <BlogEditor
        key={`${viewingMode}-${hasRevision ? post.pendingRevision?.updatedAt : post.updatedAt}`}
        initialData={activeEditorData}
        onSave={handleSave}
      />
    </div>
  );
}

