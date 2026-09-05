"use client";

import { use, useEffect, useState } from "react";

import BlogEditor, { BlogEditorData } from "@/components/blog/BlogEditor";
import BlogEditorHeading from "@/components/blog/BlogEditorHeading";
import BlogEditorToolbar from "@/components/blog/BlogEditorToolbar";
import RevisionHistoryModal from "@/components/blog/RevisionHistoryModal";
import RevisionPanel from "@/components/blog/RevisionPanel";
import Button from "@/components/shared/Button";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import InlineNotice from "@/components/shared/InlineNotice";
import { FormSkeletonContent } from "@/components/shared/skeletons/FormSkeleton";
import { expectAppData } from "@/lib/api/result";
import type { BlogStatus } from "@/lib/constants";
import {
  DEFAULT_IMAGE_FOCAL_POINT,
  type ImageFocalPoint,
} from "@/lib/imageFocalPoint";
import { formatDateTime } from "@/lib/utils";

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

interface Notice {
  message: string;
  tone: "error" | "success";
}

export default function EditMyBlogPage({ params }: Props) {
  const { slug } = use(params);
  const [post, setPost] = useState<EditablePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "withdraw" | "discard" | null
  >(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const isPublished = post?.status === "published";
  const hasRevision = Boolean(post?.pendingRevision);
  const isSubmitted = Boolean(post?.pendingRevision?.submittedAt);

  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      try {
        const response = await fetch(`/api/internal/blog/${slug}`);
        const data = await expectAppData(response);
        if (!cancelled) setPost(data.post);
      } catch (err: unknown) {
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

  useEffect(() => {
    if (!notice || notice.tone === "error") return;
    const timeout = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

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
    setNotice({
      message: requestApproval
        ? "Changes submitted for administrator review."
        : isPublished
          ? "Draft revision saved."
          : "Draft saved.",
      tone: "success",
    });
  };

  const handleWithdrawReview = async () => {
    setPendingAction("withdraw");
    setNotice(null);
    try {
      const response = await fetch(`/api/internal/blog/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelApproval: true }),
      });
      const result = await expectAppData(response);
      setPost(result.post);
      setNotice({
        message: "Review request withdrawn. The draft is editable again.",
        tone: "success",
      });
    } catch {
      setNotice({
        message: "Failed to withdraw the review request.",
        tone: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const handleDiscardRevision = async () => {
    setPendingAction("discard");
    setNotice(null);
    try {
      const response = await fetch(`/api/internal/blog/${slug}`, {
        method: "DELETE",
      });
      const result = await expectAppData(response);
      setPost(result.post);
      setDiscardDialogOpen(false);
      setNotice({
        message: "Draft changes discarded. The editor now shows live content.",
        tone: "success",
      });
    } catch {
      setDiscardDialogOpen(false);
      setNotice({
        message: "Failed to discard the draft changes.",
        tone: "error",
      });
    } finally {
      setPendingAction(null);
    }
  };

  const toolbar = (
    <BlogEditorToolbar
      backHref="/internal/dashboard"
      backLabel="Back to My Blogs"
      liveHref={isPublished ? `/blog/${slug}` : undefined}
      onOpenHistory={isPublished ? () => setHistoryModalOpen(true) : undefined}
    />
  );

  if (loading) {
    return (
      <div>
        {toolbar}
        <FormSkeletonContent label="the editor" fields={5} />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div>
        {toolbar}
        <InlineNotice tone="error">{error || "Blog not found."}</InlineNotice>
      </div>
    );
  }

  const revision = post.pendingRevision;
  const initialEditorData =
    isPublished && revision
      ? {
          title: revision.title,
          content: revision.content,
          excerpt: revision.excerpt,
          coverImage: revision.coverImage,
          coverFocalPoint:
            revision.coverFocalPoint || DEFAULT_IMAGE_FOCAL_POINT,
          tags: revision.tags,
          status: post.status,
          authors: post.authors,
        }
      : {
          title: post.title,
          content: post.content,
          excerpt: post.excerpt,
          coverImage: post.coverImage,
          coverFocalPoint: post.coverFocalPoint || DEFAULT_IMAGE_FOCAL_POINT,
          tags: post.tags,
          status: post.status,
          authors: post.authors,
        };

  return (
    <div>
      {toolbar}

      <BlogEditorHeading
        kicker="Blog editor"
        title={post.title}
        description={
          isPublished
            ? "Prepare changes without interrupting the live article."
            : "Edit and save this unpublished article."
        }
      />

      {notice && (
        <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
      )}

      {isPublished && (
        <RevisionPanel
          title={
            isSubmitted
              ? "Changes pending review"
              : hasRevision
                ? "Draft changes saved"
                : "Editing a published article"
          }
          badge={
            isSubmitted
              ? "Review requested"
              : hasRevision
                ? "Staged draft"
                : "Live"
          }
          tone={isSubmitted ? "warning" : "info"}
          description={
            isSubmitted
              ? `Submitted ${formatDateTime(revision?.submittedAt)}. The live article remains unchanged while an administrator reviews it. Withdraw the request before making more edits.`
              : hasRevision
                ? "The saved draft does not affect the live article. Request approval from the editor when it is ready."
                : "Your next save creates a staged revision. The live article stays unchanged until an administrator approves it."
          }
          actions={
            hasRevision ? (
              <>
                {isSubmitted && (
                  <Button
                    size="small"
                    onClick={() => void handleWithdrawReview()}
                    disabled={pendingAction !== null}
                  >
                    {pendingAction === "withdraw"
                      ? "Withdrawing…"
                      : "Withdraw request"}
                  </Button>
                )}
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => setDiscardDialogOpen(true)}
                  disabled={pendingAction !== null}
                >
                  Discard changes
                </Button>
              </>
            ) : undefined
          }
        />
      )}

      {!isSubmitted && (
        <BlogEditor
          key={revision ? `rev-${revision.updatedAt}` : `live-${post.status}`}
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
      )}

      {discardDialogOpen && (
        <ConfirmDialog
          title="Discard draft changes?"
          description={
            isSubmitted
              ? "This will cancel the review request and permanently discard every unapproved change."
              : "This will permanently discard every staged change and restore the editor to the live article."
          }
          confirmLabel="Discard changes"
          busyLabel="Discarding…"
          busy={pendingAction === "discard"}
          onCancel={() => setDiscardDialogOpen(false)}
          onConfirm={() => void handleDiscardRevision()}
        />
      )}

      {historyModalOpen && (
        <RevisionHistoryModal
          isOpen={historyModalOpen}
          onClose={() => setHistoryModalOpen(false)}
          slug={slug}
          livePost={{
            title: post.title,
            content: post.content,
            excerpt: post.excerpt,
            coverImage: post.coverImage,
            coverFocalPoint: post.coverFocalPoint,
            tags: post.tags,
          }}
          endpointPrefix="/api/internal/blog"
          userRole="author"
          onRestoreSuccess={(restoredPost) => {
            setPost(restoredPost);
            setNotice({
              message:
                "Historical version loaded into draft. You can make edits and request approval.",
              tone: "success",
            });
          }}
        />
      )}
    </div>
  );
}
