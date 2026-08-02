"use client";

import { useRef, useState } from "react";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import styles from "./MarkdownEditor.module.scss";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  uploadEndpoint?: string;
  placeholder?: string;
  rows?: number;
}

export default function MarkdownEditor({
  value,
  onChange,
  uploadEndpoint,
  placeholder = "Write content in Markdown...",
  rows = 15,
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    if (!uploadEndpoint) return;
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Upload failed");
      }

      const { url } = (await res.json()) as { url: string };
      const textarea = textareaRef.current;

      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const imageMarkdown = `![image](${url})`;
        const newContent =
          value.slice(0, start) + imageMarkdown + value.slice(end);
        onChange(newContent);
        return;
      }

      onChange(`${value}\n![image](${url})\n`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.editor}>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.toolbar}>
        {uploadEndpoint && (
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Insert Image"}
          </button>
        )}
        <button
          type="button"
          className={`${styles.btnSecondary} ${showPreview ? styles.active : ""}`}
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? "Edit" : "Preview"}
        </button>
      </div>
      {uploadEndpoint && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImageUpload(file);
            e.target.value = "";
          }}
        />
      )}
      {showPreview ? (
        <div className={styles.preview}>
          <MarkdownRenderer content={value} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.textarea}
          placeholder={placeholder}
          rows={rows}
        />
      )}
    </div>
  );
}
