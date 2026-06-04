"use client";

import { useState, useEffect } from "react";
import MarkdownEditor from "@/components/shared/MarkdownEditor";
import ImageUpload from "@/components/shared/ImageUpload";
import TagBadge from "./TagBadge";
import { IconX } from "@/components/shared/Icons";
import { BLOG_TAGS, BLOG_STATUSES, type BlogStatus } from "@/lib/constants";
import styles from "./BlogEditor.module.scss";

interface BlogAuthor {
  userId: string;
  name: string;
}

interface BlogEditorProps {
  initialData?: {
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    tags: string[];
    status: BlogStatus;
    authors: BlogAuthor[];
  };
  onSave: (data: {
    title: string;
    content: string;
    excerpt: string;
    coverImage: string;
    tags: string[];
    status: BlogStatus;
    authors: BlogAuthor[];
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
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [status, setStatus] = useState<BlogStatus>(
    initialData?.status || "draft",
  );
  const [customTagInput, setCustomTagInput] = useState("");
  const [authors, setAuthors] = useState<BlogAuthor[]>(
    initialData?.authors || [],
  );
  const [allUsers, setAllUsers] = useState<{ _id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => setAllUsers(data.items || []))
      .catch(() => {});
  }, []);

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const addCustomTag = () => {
    const trimmed = customTagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setCustomTagInput("");
  };

  const handleCustomTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCustomTag();
    }
  };

  const addAuthor = (userId: string) => {
    if (authors.some((a) => a.userId === userId)) return;
    const user = allUsers.find((u) => u._id === userId);
    if (user) {
      setAuthors((prev) => [...prev, { userId: user._id, name: user.name }]);
    }
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

  // Users not yet added as authors
  const availableUsers = allUsers.filter(
    (u) => !authors.some((a) => a.userId === u._id),
  );

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
        {availableUsers.length > 0 && (
          <select
            className={styles.select}
            value=""
            onChange={(e) => {
              if (e.target.value) addAuthor(e.target.value);
            }}
          >
            <option value="">Add an author...</option>
            {availableUsers.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Cover Image */}
      <div className={styles.field}>
        <label className={styles.label}>Cover Image</label>
        <ImageUpload
          value={coverImage}
          onChange={setCoverImage}
          uploadEndpoint="/api/admin/blog/upload-image"
          label="Image"
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
          {tags
            .filter((t) => !(BLOG_TAGS as readonly string[]).includes(t))
            .map((tag) => (
              <TagBadge
                key={tag}
                tag={tag}
                active={true}
                onClick={() => toggleTag(tag)}
              />
            ))}
        </div>
        <div className={styles.customTagRow}>
          <input
            type="text"
            value={customTagInput}
            onChange={(e) => setCustomTagInput(e.target.value)}
            onKeyDown={handleCustomTagKeyDown}
            className={styles.input}
            placeholder="Add custom tag..."
            maxLength={50}
          />
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={addCustomTag}
            disabled={!customTagInput.trim()}
          >
            Add
          </button>
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
        <label className={styles.label}>Content (Markdown)</label>
        <MarkdownEditor
          value={content}
          onChange={setContent}
          uploadEndpoint="/api/admin/blog/upload-image"
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
          {saving ? "Saving..." : isNew ? "Create Post" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
