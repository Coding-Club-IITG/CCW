"use client";

import { Check, X as IconX } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

import BlogEditor, { BlogEditorData } from "@/components/blog/BlogEditor";
import BlogEditorHeading from "@/components/blog/BlogEditorHeading";
import BlogEditorToolbar from "@/components/blog/BlogEditorToolbar";
import RevisionDiffViewer from "@/components/blog/RevisionDiffViewer";
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

interface RevisionData {
  title: string;
  content: string;
  excerpt: string;
  coverImage: string;
  coverFocalPoint?: ImageFocalPoint;
  tags: string[];
  updatedAt: string;
  submittedAt: string | null;
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
  slug: string;
  updatedAt: string;
  pendingRevision?: RevisionData | null;
}

type ReviewAction = "approve" | "reject";

interface Notice {
  message: string;
  tone: "error" | "success";
}

export default function EditBlogPostPage({ params }: Props) {
  const { slug } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<EditablePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPost() {
      try {
        const response = await fetch(`/api/admin/blog/${slug}`);
        const data = await expectAppData(response);
        if (!cancelled) setPost(data.post);
      } catch {
        if (!cancelled) setError("Failed to load post.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchPost();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleSave = async (data: BlogEditorData) => {
    const response = await fetch(`/api/admin/blog/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const updated = await expectAppData(response);
    setPost(updated.post);
    setNotice({ message: "Live post saved.", tone: "success" });
    if (updated.post?.slug && updated.post.slug !== slug) {
      router.push(`/admin/blog/${updated.post.slug}/edit`);
    }
  };

  const submitReviewAction = async (action: ReviewAction) => {
    setActionLoading(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/blog/${slug}/revision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await expectAppData(response);
      setPost(data.post);
      setReviewAction(null);
      setNotice({
        message:
          action === "approve"
            ? "Changes approved and published."
            : "Proposed changes rejected and discarded.",
        tone: "success",
      });
    } catch {
      setReviewAction(null);
      setNotice({
        message:
          action === "approve"
            ? "Failed to approve the revision."
            : "Failed to reject the revision.",
        tone: "error",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const toolbar = (
    <BlogEditorToolbar
      backHref="/admin/blog"
      backLabel="Back to Blog Management"
      liveHref={post?.status === "published" ? `/blog/${slug}` : undefined}
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
        <InlineNotice tone="error">{error || "Post not found."}</InlineNotice>
      </div>
    );
  }

  const revision = post.pendingRevision;
  const isSubmitted = Boolean(revision?.submittedAt);
  const liveEditorData = {
    title: post.title,
    content: post.content,
    excerpt: post.excerpt,
    coverImage: post.coverImage,
    coverFocalPoint: post.coverFocalPoint || DEFAULT_IMAGE_FOCAL_POINT,
    tags: post.tags,
    status: post.status,
    authors: post.authors || [],
  };

  return (
    <div>
      {toolbar}

      <BlogEditorHeading
        kicker="Admin blog editor"
        title={post.title}
        description="Edit the live article and/or review staged author changes."
      />

      {notice && (
        <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
      )}

      {revision && (
        <RevisionPanel
          title={
            isSubmitted
              ? "Revision ready for review"
              : "Author draft in progress"
          }
          badge={isSubmitted ? "Review requested" : "Draft staged"}
          tone={isSubmitted ? "warning" : "info"}
          description={
            isSubmitted
              ? `Submitted ${formatDateTime(revision.submittedAt)}. Compare the proposal with the live post before publishing or rejecting it.`
              : `Last saved ${formatDateTime(revision.updatedAt)}. The author has not requested review yet, so publishing actions are unavailable. The live post remains unchanged.`
          }
          actions={
            isSubmitted ? (
              <>
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => setReviewAction("approve")}
                  disabled={actionLoading}
                >
                  <Check width={14} height={14} /> Approve &amp; publish
                </Button>
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => setReviewAction("reject")}
                  disabled={actionLoading}
                >
                  <IconX width={14} height={14} /> Reject changes
                </Button>
              </>
            ) : undefined
          }
        >
          <RevisionDiffViewer livePost={post} revision={revision} />
        </RevisionPanel>
      )}

      <BlogEditor
        key={`admin-live-${post.updatedAt}`}
        initialData={liveEditorData}
        onSave={handleSave}
      />

      {reviewAction && (
        <ConfirmDialog
          title={
            reviewAction === "approve"
              ? "Publish this revision?"
              : "Reject this revision?"
          }
          description={
            reviewAction === "approve"
              ? "The proposed fields will replace the live article immediately."
              : "The proposed changes will be permanently discarded. The live article will not change."
          }
          confirmLabel={
            reviewAction === "approve" ? "Approve & publish" : "Reject changes"
          }
          busyLabel={reviewAction === "approve" ? "Publishing…" : "Rejecting…"}
          variant={reviewAction === "approve" ? "primary" : "danger"}
          busy={actionLoading}
          onCancel={() => setReviewAction(null)}
          onConfirm={() => void submitReviewAction(reviewAction)}
        />
      )}
    </div>
  );
}
