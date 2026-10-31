"use client";

import React, { useRef, useState } from "react";
import {
  Bold,
  Code,
  Columns,
  Eye,
  FileEdit,
  Heading,
  Italic,
  Link as LinkIcon,
  List,
  Quote,
  ShieldCheck,
  Strikethrough,
} from "lucide-react";
import { MAX_INFO_MARKDOWN_LENGTH, MAX_TITLE_LENGTH } from "../constants";
import type { InfoSlideContent } from "../types";
import { useSlideDraft } from "../useSlideDraft";
import { FieldError } from "./FieldError";
import { SafeMarkdownRenderer } from "./SafeMarkdownRenderer";
import styles from "./styles/InfoSlideForm.module.scss";

type ViewMode = "edit" | "split" | "preview";

export function InfoSlideForm() {
  const { content, updateContent, errors, markTouched } = useSlideDraft();
  const infoContent = content as InfoSlideContent;

  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const title = infoContent.title ?? "";
  const markdown = infoContent.markdown ?? "";

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateContent((prev) => ({
      ...prev,
      title: e.target.value,
    }));
  };

  const handleMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateContent((prev) => ({
      ...prev,
      markdown: e.target.value,
    }));
  };

  const insertSyntax = (before: string, after = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentVal = textarea.value;
    const selected = currentVal.substring(start, end);

    const replacement = `${before}${selected || "text"}${after}`;
    const nextVal =
      currentVal.substring(0, start) + replacement + currentVal.substring(end);

    updateContent((prev) => ({
      ...prev,
      markdown: nextVal,
    }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + (selected ? selected.length : 4),
      );
    }, 0);
  };

  return (
    <div className={styles.infoForm}>
      {/* Slide Title Field */}
      <div className={styles.fieldGroup}>
        <div className={styles.fieldLabel}>
          <label htmlFor="info-title">Slide Heading (Optional)</label>
          <span
            className={`${styles.charCount} ${
              title.length > MAX_TITLE_LENGTH ? styles.charLimitExceeded : ""
            }`}
          >
            {title.length}/{MAX_TITLE_LENGTH}
          </span>
        </div>
        <input
          id="info-title"
          type="text"
          value={title}
          onChange={handleTitleChange}
          onBlur={() => markTouched("title")}
          placeholder="e.g. Session Introduction & Objectives"
          maxLength={MAX_TITLE_LENGTH + 20}
          className={`${styles.textInput} ${errors.title ? styles.hasError : ""}`}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? "info-title-error" : undefined}
        />
        <FieldError id="info-title-error" error={errors.title} />
      </div>

      {/* Editor & Preview Header Controls */}
      <div className={styles.viewControls}>
        <div className={styles.fieldLabel}>
          <span>Markdown Content</span>
          <span
            className={`${styles.charCount} ${
              markdown.length > MAX_INFO_MARKDOWN_LENGTH
                ? styles.charLimitExceeded
                : markdown.length > MAX_INFO_MARKDOWN_LENGTH * 0.9
                  ? styles.charLimitNear
                  : ""
            }`}
          >
            {markdown.length.toLocaleString()}/
            {MAX_INFO_MARKDOWN_LENGTH.toLocaleString()}
          </span>
        </div>

        <div className={styles.tabGroup} role="tablist" aria-label="Editor View">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "edit"}
            onClick={() => setViewMode("edit")}
            className={`${styles.tabButton} ${
              viewMode === "edit" ? styles.activeTab : ""
            }`}
          >
            <FileEdit size={13} aria-hidden="true" />
            <span>Write</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "split"}
            onClick={() => setViewMode("split")}
            className={`${styles.tabButton} ${
              viewMode === "split" ? styles.activeTab : ""
            }`}
          >
            <Columns size={13} aria-hidden="true" />
            <span>Split</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "preview"}
            onClick={() => setViewMode("preview")}
            className={`${styles.tabButton} ${
              viewMode === "preview" ? styles.activeTab : ""
            }`}
          >
            <Eye size={13} aria-hidden="true" />
            <span>Preview</span>
          </button>
        </div>
      </div>

      {/* Formatting Toolbar (shown when editor is visible) */}
      {viewMode !== "preview" && (
        <div className={styles.toolbar} role="toolbar" aria-label="Formatting">
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => insertSyntax("**", "**")}
            title="Bold (**text**)"
          >
            <Bold size={14} />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => insertSyntax("*", "*")}
            title="Italic (*text*)"
          >
            <Italic size={14} />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => insertSyntax("~~", "~~")}
            title="Strikethrough (~~text~~)"
          >
            <Strikethrough size={14} />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => insertSyntax("`", "`")}
            title="Inline Code (`code`)"
          >
            <Code size={14} />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => insertSyntax("### ")}
            title="Heading (### )"
          >
            <Heading size={14} />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => insertSyntax("[", "](https://)")}
            title="Link ([text](url))"
          >
            <LinkIcon size={14} />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => insertSyntax("> ")}
            title="Quote (> )"
          >
            <Quote size={14} />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => insertSyntax("- ")}
            title="List item (- )"
          >
            <List size={14} />
          </button>
          <button
            type="button"
            className={styles.toolButton}
            onClick={() => insertSyntax("$$ ", " $$")}
            title="Math Formula ($$ f(x) $$)"
          >
            <span style={{ fontFamily: "serif", fontWeight: "bold" }}>fx</span>
          </button>
        </div>
      )}

      {/* Editor & Preview Body */}
      <div
        className={
          viewMode === "split"
            ? styles.splitContainer
            : styles.editorContainer
        }
      >
        {viewMode !== "preview" && (
          <div className={styles.fieldGroup}>
            <textarea
              id="info-markdown"
              ref={textareaRef}
              value={markdown}
              onChange={handleMarkdownChange}
              onBlur={() => markTouched("markdown")}
              placeholder="Write slide content using Markdown..."
              className={`${styles.textarea} ${
                errors.markdown ? styles.hasError : ""
              }`}
              aria-invalid={Boolean(errors.markdown)}
              aria-describedby={
                errors.markdown ? "info-markdown-error" : undefined
              }
            />
            <FieldError id="info-markdown-error" error={errors.markdown} />
          </div>
        )}

        {viewMode !== "edit" && (
          <div
            className={styles.previewPanel}
            aria-label="Rendered Markdown Preview"
          >
            <div className={styles.previewBadge}>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>Safe Render Preview</span>
            </div>
            {markdown.trim() ? (
              <SafeMarkdownRenderer
                content={markdown}
                showSafetyWarnings={true}
              />
            ) : (
              <div className={styles.emptyPreview}>
                Markdown preview will appear here as you type.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
