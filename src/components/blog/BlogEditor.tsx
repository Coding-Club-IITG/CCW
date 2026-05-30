"use client";

import { useState, useRef } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import TagBadge from "./TagBadge";
import {
  BLOG_TAGS,
  BLOG_STATUSES,
  type BlogTag,
  type BlogStatus,
} from "@/lib/constants";
import styles from "./BlogEditor.module.scss";

interface BlogEditorProps {
  initialData?: {
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    tags: BlogTag[];
    status: BlogStatus;
  };
  onSave: (data: {
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    tags: BlogTag[];
    status: BlogStatus;
  }) => Promise<void>;
  isNew?: boolean;
}

export default function BlogEditor({
  initialData,
  onSave,
  isNew,
}: BlogEditorProps) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [content, setContent] = useState(initialData?.content || "");
  const [excerpt, setExcerpt] = useState(initialData?.excerpt || "");
  const [coverImage, setCoverImage] = useState(initialData?.coverImage || "");
  const [tags, setTags] = useState<BlogTag[]>(initialData?.tags || []);
  const [status, setStatus] = useState<BlogStatus>(
    initialData?.status || "draft",
  );
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inlineImageRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const toggleTag = (tag: BlogTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleImageUpload = async (file: File, type: "cover" | "inline") => {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/blog/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();

      if (type === "cover") {
        setCoverImage(url);
      } else {
        // Insert markdown image at cursor position
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const imageMarkdown = `![image](${url})`;
          const newContent =
            content.slice(0, start) + imageMarkdown + content.slice(end);
          setContent(newContent);
        } else {
          setContent((prev) => prev + `\n![image](${url})\n`);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ title, content, excerpt, coverImage, tags, status });
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

      {/* Cover Image */}
      <div className={styles.field}>
        <label className={styles.label}>Cover Image</label>
        <div className={styles.coverRow}>
          {coverImage && (
            <img src={coverImage} alt="Cover" className={styles.coverPreview} />
          )}
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading
              ? "Uploading..."
              : coverImage
                ? "Change Image"
                : "Upload Image"}
          </button>
          {coverImage && (
            <button
              type="button"
              className={styles.btnDanger}
              onClick={() => setCoverImage("")}
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file, "cover");
            e.target.value = "";
          }}
        />
      </div>

      {/* Tags */}
      <div className={styles.field}>
        <label className={styles.label}>Tags</label>
        <div className={styles.tagsGrid}>
          {BLOG_TAGS.map((tag) => (
            <TagBadge
              key={tag}
              tag={tag}
              active={tags.includes(tag)}
              onClick={() => toggleTag(tag)}
            />
          ))}
        </div>
      </div>

      {/* Status */}
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

      {/* Content */}
      <div className={styles.field}>
        <div className={styles.contentHeader}>
          <label className={styles.label}>Content (Markdown)</label>
          <div className={styles.contentActions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => inlineImageRef.current?.click()}
              disabled={uploading}
            >
              Insert Image
            </button>
            <button
              type="button"
              className={`${styles.btnSecondary} ${showPreview ? styles.active : ""}`}
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? "Edit" : "Preview"}
            </button>
          </div>
        </div>
        <input
          ref={inlineImageRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file, "inline");
            e.target.value = "";
          }}
        />
        {showPreview ? (
          <div className={styles.preview}>
            <MarkdownRenderer content={content} />
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={styles.contentTextarea}
            placeholder="Write your blog post in Markdown..."
            rows={20}
          />
        )}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.btnPrimary}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving..." : isNew ? "Create Post" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
