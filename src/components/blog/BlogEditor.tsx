"use client";

import { useState } from "react";
import MarkdownEditor from "@/components/shared/MarkdownEditor";
import ImageUpload from "@/components/shared/ImageUpload";
import UserSearch, { UserSearchItem } from "@/components/shared/UserSearch";
import TagEditor from "@/components/shared/TagEditor";
import { X as IconX } from "lucide-react";
import { BLOG_TAGS, BLOG_STATUSES, type BlogStatus } from "@/lib/constants";
import {
  DEFAULT_IMAGE_FOCAL_POINT,
  type ImageFocalPoint,
} from "@/lib/imageFocalPoint";
import styles from "./BlogEditor.module.scss";

interface BlogAuthor {
  userId: string;
  name: string;
}

export interface BlogEditorData {
  title: string;
  content: string;
  excerpt: string;
  coverImage: string;
  coverFocalPoint: ImageFocalPoint;
  tags: string[];
  status: BlogStatus;
  authors: BlogAuthor[];
}

interface BlogEditorProps {
  initialData?: {
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    coverFocalPoint?: ImageFocalPoint;
    tags: string[];
    status: BlogStatus;
    authors: BlogAuthor[];
  };
  onSave: (data: BlogEditorData) => Promise<void>;
  isNew?: boolean;
  canManageAuthors?: boolean;
  canManageStatus?: boolean;
  uploadEndpoint?: string;
  saveButtonLabel?: string;
  secondaryButton?: {
    label: string;
    onClick: (data: BlogEditorData) => Promise<void>;
    disabled?: boolean;
    variant?: "primary" | "secondary" | "danger";
  };
}

export default function BlogEditor({
  initialData,
  onSave,
  isNew,
  canManageAuthors = true,
  canManageStatus = true,
  uploadEndpoint = "/api/admin/blog/upload-image",
  saveButtonLabel,
  secondaryButton,
}: BlogEditorProps) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [content, setContent] = useState(initialData?.content || "");
  const [excerpt, setExcerpt] = useState(initialData?.excerpt || "");
  const [coverImage, setCoverImage] = useState(initialData?.coverImage || "");
  const [coverFocalPoint, setCoverFocalPoint] = useState<ImageFocalPoint>(
    initialData?.coverFocalPoint || DEFAULT_IMAGE_FOCAL_POINT,
  );
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [status, setStatus] = useState<BlogStatus>(
    initialData?.status || "draft",
  );
  const [authors, setAuthors] = useState<BlogAuthor[]>(
    initialData?.authors || [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addAuthor = (user: UserSearchItem) => {
    if (authors.some((author) => author.userId === user.id)) return;
    setAuthors((previous) => [
      ...previous,
      { userId: user.id, name: user.name },
    ]);
  };

  const removeAuthor = (userId: string) => {
    setAuthors((prev) => prev.filter((a) => a.userId !== userId));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({
        title,
        content,
        excerpt,
        coverImage,
        coverFocalPoint,
        tags,
        status,
        authors,
      });
    } catch (err: any) {
      setError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.editor}>
      {error && <div className={styles.error}>{error}</div>}

      {/* Title */}
      <div className={styles.field}>
        <label className={styles.label}>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={styles.input}
          placeholder="Post title"
          maxLength={200}
        />
      </div>

      {/* Excerpt */}
      <div className={styles.field}>
        <label className={styles.label}>Excerpt</label>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          className={styles.textarea}
          placeholder="Brief summary shown in the blog listing..."
          maxLength={500}
          rows={2}
        />
      </div>

      {/* Authors */}
      {canManageAuthors && (
        <div className={styles.field}>
          <label className={styles.label}>Authors</label>
          {authors.length > 0 && (
            <div className={styles.authorsList}>
              {authors.map((a) => (
                <span key={a.userId} className={styles.authorChip}>
                  {a.name}
                  <button
                    type="button"
                    className={styles.authorRemove}
                    onClick={() => removeAuthor(a.userId)}
                    aria-label={`Remove ${a.name}`}
                  >
                    <IconX width="12" height="12" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <UserSearch
            excludedIds={authors.map((author) => author.userId)}
            placeholder="Search members by name or email to add as author…"
            onSelect={addAuthor}
          />
        </div>
      )}

      {/* Cover Image */}
      <div className={styles.field}>
        <label className={styles.label}>Cover Image</label>
        <ImageUpload
          value={coverImage}
          onChange={(value) => {
            setCoverImage(value);
            if (value !== coverImage) {
              setCoverFocalPoint(DEFAULT_IMAGE_FOCAL_POINT);
            }
          }}
          uploadEndpoint={uploadEndpoint}
          label="Image"
          focalPoint={coverFocalPoint}
          onFocalPointChange={setCoverFocalPoint}
          focalPointAspectRatio="16 / 10"
        />
      </div>

      {/* Tags */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="blog-tags">
          Tags
        </label>
        <TagEditor
          id="blog-tags"
          value={tags}
          onChange={setTags}
          suggestions={BLOG_TAGS}
          placeholder="Add custom tag…"
        />
      </div>

      {/* Status */}
      {canManageStatus && (
        <div className={styles.field}>
          <label className={styles.label}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as BlogStatus)}
            className={styles.select}
          >
            {BLOG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Content */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="blog-content">
          Content (Markdown)
        </label>
        <MarkdownEditor
          id="blog-content"
          value={content}
          onChange={setContent}
          uploadEndpoint={uploadEndpoint}
          placeholder="Write your blog post in Markdown..."
          rows={20}
        />
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={handleSave}
          disabled={saving}
        >
          {saving
            ? "Saving..."
            : saveButtonLabel || (isNew ? "Create Post" : "Save Changes")}
        </button>

        {secondaryButton && (
          <button
            type="button"
            className={
              secondaryButton.variant === "primary"
                ? styles.btnPrimary
                : secondaryButton.variant === "danger"
                  ? styles.btnDanger
                  : styles.btnSecondary
            }
            onClick={async () => {
              if (!title.trim()) {
                setError("Title is required.");
                return;
              }
              setSaving(true);
              setError("");
              try {
                await secondaryButton.onClick({
                  title,
                  content,
                  excerpt,
                  coverImage,
                  coverFocalPoint,
                  tags,
                  status,
                  authors,
                });
              } catch (err: any) {
                setError(err.message || "Action failed.");
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving || secondaryButton.disabled}
          >
            {secondaryButton.label}
          </button>
        )}
      </div>
    </div>
  );
}

