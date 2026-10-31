"use client";

import React from "react";
import { Check, Eye, EyeOff, ThumbsUp, UserCheck, UserX } from "lucide-react";
import { MAX_PROMPT_LENGTH } from "../constants";
import type { QASlideContent } from "../types";
import { useSlideDraft } from "../useSlideDraft";
import { FieldError } from "./FieldError";
import styles from "./styles/QASlideForm.module.scss";

export function QASlideForm() {
  const { content, updateContent, errors, markTouched } = useSlideDraft();
  const qa = content as QASlideContent;

  const handlePromptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateContent((prev) => ({
      ...prev,
      prompt: e.target.value,
    }));
  };

  const handleSettingToggle = (
    key: "allowAnonymous" | "isPublicVisibility" | "allowUpvotes",
    value: boolean,
  ) => {
    updateContent((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  return (
    <div className={styles.qaForm}>
      {/* Session Question Prompt / Heading */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <label htmlFor="qa-prompt">Q&A Prompt / Callout</label>
          <span className={styles.charCount}>
            {(qa.prompt || "").length}/{MAX_PROMPT_LENGTH}
          </span>
        </div>
        <div className={styles.fieldGroup}>
          <input
            id="qa-prompt"
            type="text"
            value={qa.prompt || ""}
            onChange={handlePromptChange}
            onBlur={() => markTouched("prompt")}
            placeholder="e.g. Ask any question to the speaker or panel..."
            maxLength={MAX_PROMPT_LENGTH}
            className={`${styles.textInput} ${
              errors.prompt ? styles.hasError : ""
            }`}
            aria-invalid={Boolean(errors.prompt)}
            aria-describedby={errors.prompt ? "qa-prompt-error" : undefined}
          />
          <FieldError id="qa-prompt-error" error={errors.prompt} />
        </div>
      </div>

      {/* Q&A Settings List */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>Participation Rules & Visibility</span>
        </div>

        <div className={styles.settingsList}>
          {/* Anonymous submission setting */}
          <label className={styles.settingItem}>
            <input
              type="checkbox"
              checked={qa.allowAnonymous}
              onChange={(e) =>
                handleSettingToggle("allowAnonymous", e.target.checked)
              }
              className={styles.checkbox}
            />
            <div className={styles.settingText}>
              <span className={styles.settingTitle}>
                Allow Anonymous Submissions
              </span>
              <span className={styles.settingDesc}>
                Participants can submit questions without attaching their name or
                institute profile.
              </span>
            </div>
          </label>

          {/* Public question visibility setting */}
          <label className={styles.settingItem}>
            <input
              type="checkbox"
              checked={qa.isPublicVisibility}
              onChange={(e) =>
                handleSettingToggle("isPublicVisibility", e.target.checked)
              }
              className={styles.checkbox}
            />
            <div className={styles.settingText}>
              <span className={styles.settingTitle}>
                Public Question Visibility
              </span>
              <span className={styles.settingDesc}>
                Questions become visible to all attendees immediately upon submission.
                When unchecked, submitted questions remain private to the host until
                approved.
              </span>
            </div>
          </label>

          {/* Upvote setting */}
          <label className={styles.settingItem}>
            <input
              type="checkbox"
              checked={qa.allowUpvotes}
              onChange={(e) =>
                handleSettingToggle("allowUpvotes", e.target.checked)
              }
              className={styles.checkbox}
            />
            <div className={styles.settingText}>
              <span className={styles.settingTitle}>Allow Audience Upvoting</span>
              <span className={styles.settingDesc}>
                Participants can upvote questions to help prioritize the most
                popular questions for discussion.
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Live Behavior Preview */}
      <div className={styles.previewCard}>
        <span className={styles.previewTitle}>Live Q&A Configuration</span>
        <div className={styles.badgeRow}>
          <div
            className={`${styles.featureBadge} ${
              qa.allowAnonymous ? styles.activeBadge : ""
            }`}
          >
            {qa.allowAnonymous ? <UserCheck size={13} /> : <UserX size={13} />}
            <span>
              {qa.allowAnonymous ? "Anonymous Allowed" : "Identified Only"}
            </span>
          </div>

          <div
            className={`${styles.featureBadge} ${
              qa.isPublicVisibility ? styles.activeBadge : ""
            }`}
          >
            {qa.isPublicVisibility ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>
              {qa.isPublicVisibility
                ? "Instant Public Feed"
                : "Host Moderated Feed"}
            </span>
          </div>

          <div
            className={`${styles.featureBadge} ${
              qa.allowUpvotes ? styles.activeBadge : ""
            }`}
          >
            <ThumbsUp size={13} />
            <span>
              {qa.allowUpvotes ? "Upvoting Enabled" : "Upvoting Disabled"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
