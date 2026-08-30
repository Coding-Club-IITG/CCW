"use client";

import { useEffect, useRef, useState } from "react";

import { expectAppData } from "@/lib/api/result";
import {
  deriveUploadedImageAltText,
  replaceSelectionWithMarkdown,
} from "@/lib/markdownEditor";

import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import styles from "./MarkdownEditor.module.scss";

interface MarkdownEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  uploadEndpoint?: string;
  placeholder?: string;
  rows?: number;
}

interface InsertionRange {
  start: number;
  end: number;
  value: string;
}

export default function MarkdownEditor({
  id,
  value,
  onChange,
  uploadEndpoint,
  placeholder = "Write content in Markdown...",
  rows = 15,
}: MarkdownEditorProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const insertionRef = useRef<InsertionRange>({
    start: value.length,
    end: value.length,
    value,
  });
  const pendingCaretRef = useRef<{ value: string; position: number } | null>(
    null,
  );

  useEffect(() => {
    const pending = pendingCaretRef.current;
    if (!pending || uploading || showPreview || value !== pending.value) return;

    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(pending.position, pending.position);
    insertionRef.current = {
      start: pending.position,
      end: pending.position,
      value,
    };
    pendingCaretRef.current = null;
  }, [showPreview, uploading, value]);

  const rememberSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    insertionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      value: textarea.value,
    };
  };

  const openFilePicker = () => {
    if (uploading) return;
    const textarea = textareaRef.current;
    if (textarea) {
      rememberSelection();
    } else {
      const start = Math.min(insertionRef.current.start, value.length);
      const end = Math.min(insertionRef.current.end, value.length);
      insertionRef.current = { start, end, value };
      setShowPreview(false);
    }
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (file: File) => {
    if (!uploadEndpoint) return;
    const insertion = insertionRef.current;
    setUploading(true);
    setError("");
    setAnnouncement(`Uploading ${file.name}.`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(uploadEndpoint, {
        method: "POST",
        body: formData,
      });

      const { url } = await expectAppData<{ url: string }>(res);
      const altText = deriveUploadedImageAltText(file.name);
      const imageMarkdown = `![${altText}](${url})`;
      const inserted = replaceSelectionWithMarkdown(
        insertion.value,
        insertion.start,
        insertion.end,
        imageMarkdown,
      );
      pendingCaretRef.current = {
        value: inserted.value,
        position: inserted.caret,
      };
      onChange(inserted.value);
      setAnnouncement(`${file.name} uploaded and inserted.`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to upload image.";
      setError(message);
      setAnnouncement("");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.editor} aria-busy={uploading}>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <div className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </div>
      <div className={styles.toolbar}>
        {uploadEndpoint && (
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={openFilePicker}
            disabled={uploading}
            aria-controls={`${id}-image-upload`}
          >
            {uploading ? "Uploading..." : "Insert Image"}
          </button>
        )}
        <button
          type="button"
          className={`${styles.btnSecondary} ${showPreview ? styles.active : ""}`}
          onClick={() => {
            if (!showPreview) rememberSelection();
            setShowPreview(!showPreview);
          }}
          disabled={uploading}
        >
          {showPreview ? "Edit" : "Preview"}
        </button>
      </div>
      {uploadEndpoint && (
        <input
          ref={fileInputRef}
          id={`${id}-image-upload`}
          type="file"
          accept="image/*"
          aria-label="Choose an image to upload"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImageUpload(file);
            e.target.value = "";
          }}
        />
      )}
      {showPreview ? (
        <div
          id={`${id}-preview`}
          className={styles.preview}
          role="region"
          aria-label="Markdown preview"
        >
          <MarkdownRenderer content={value} />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          id={id}
          value={value}
          onChange={(e) => {
            if (uploading) return;
            onChange(e.target.value);
          }}
          onSelect={rememberSelection}
          onBlur={rememberSelection}
          className={styles.textarea}
          placeholder={placeholder}
          rows={rows}
          disabled={uploading}
        />
      )}
    </div>
  );
}
