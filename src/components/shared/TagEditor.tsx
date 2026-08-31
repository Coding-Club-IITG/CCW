"use client";

import { useId, useState } from "react";

import {
  DEFAULT_TAG_MAX_LENGTH,
  normalizeTag,
  normalizeTags,
} from "@/lib/tagUtils";

import TagBadge from "./TagBadge";
import styles from "./TagEditor.module.scss";

interface TagEditorProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: readonly string[];
  maxTags?: number;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  id?: string;
}

export default function TagEditor({
  value,
  onChange,
  suggestions = [],
  maxTags,
  maxLength = DEFAULT_TAG_MAX_LENGTH,
  placeholder = "Add a tag…",
  required = false,
  id,
}: TagEditorProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [input, setInput] = useState("");
  const atLimit = maxTags !== undefined && value.length >= maxTags;

  function addTags(rawTags: readonly string[]) {
    const candidates = normalizeTags([...value, ...rawTags]).filter(
      (tag) => tag.length <= maxLength,
    );
    onChange(maxTags === undefined ? candidates : candidates.slice(0, maxTags));
  }

  function commitInput() {
    const tag = normalizeTag(input);
    if (tag) addTags([tag]);
    setInput("");
  }

  function handleChange(next: string) {
    if (!next.includes(",")) {
      setInput(next);
      return;
    }
    const parts = next.split(",");
    addTags(parts.slice(0, -1));
    setInput(parts.at(-1) ?? "");
  }

  function removeTag(tag: string) {
    onChange(value.filter((item) => item.toLowerCase() !== tag.toLowerCase()));
  }

  const selected = new Set(value.map((tag) => tag.toLowerCase()));
  const normalizedSuggestions = normalizeTags(suggestions);

  return (
    <div className={styles.editor}>
      {value.length > 0 && (
        <div className={styles.selected} aria-label="Selected tags">
          {value.map((tag) => (
            <TagBadge
              key={tag.toLowerCase()}
              tag={tag}
              active
              removable
              ariaLabel={`Remove ${tag} tag`}
              onClick={() => removeTag(tag)}
            />
          ))}
        </div>
      )}

      {normalizedSuggestions.length > 0 && (
        <div className={styles.suggestions} aria-label="Suggested tags">
          {normalizedSuggestions
            .filter((tag) => !selected.has(tag.toLowerCase()))
            .map((tag) => {
              return (
                <TagBadge
                  key={tag.toLowerCase()}
                  tag={tag}
                  disabled={atLimit}
                  ariaLabel={`Add ${tag} tag`}
                  onClick={() => addTags([tag])}
                />
              );
            })}
        </div>
      )}

      <div className={styles.inputRow}>
        <input
          id={inputId}
          type="text"
          value={input}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              commitInput();
            } else if (event.key === "Backspace" && !input && value.length) {
              removeTag(value[value.length - 1]);
            }
          }}
          onBlur={commitInput}
          placeholder={atLimit ? "Tag limit reached" : placeholder}
          maxLength={maxLength}
          disabled={atLimit}
          required={required && value.length === 0}
          aria-describedby={`${inputId}-hint`}
        />
        <button
          type="button"
          onClick={commitInput}
          disabled={!normalizeTag(input) || atLimit}
        >
          Add
        </button>
      </div>
      <span id={`${inputId}-hint`} className={styles.hint}>
        Press Enter or comma to add a tag
        {maxTags !== undefined ? ` (${value.length}/${maxTags})` : ""}.
      </span>
    </div>
  );
}
