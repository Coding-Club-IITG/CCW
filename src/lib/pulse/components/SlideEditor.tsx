"use client";

import React, { useState } from "react";
import {
  AlertTriangle,
  BookmarkCheck,
  Check,
  FileText,
  HelpCircle,
  ListOrdered,
  MessageSquare,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { PacingMode, PulseSlide, SlideType } from "../types";
import { SlideDraftProvider, useSlideDraft } from "../useSlideDraft";
import { InfoSlideForm } from "./InfoSlideForm";
import { MCQSlideForm } from "./MCQSlideForm";
import { QASlideForm } from "./QASlideForm";
import styles from "./styles/SlideEditor.module.scss";

interface SlideEditorProps {
  initialSlide?: Partial<PulseSlide>;
  initialPacingMode?: PacingMode;
  onSave?: (slide: PulseSlide) => void;
}

function InnerSlideEditor({ onSave }: { onSave?: (slide: PulseSlide) => void }) {
  const {
    activeType,
    switchType,
    pacingMode,
    setPacingMode,
    isDirty,
    errors,
    hasCachedContent,
    commit,
    reset,
  } = useSlideDraft();

  const [saveSuccess, setSaveSuccess] = useState(false);
  const errorCount = Object.keys(errors).length;

  const handleSave = () => {
    const result = commit();
    if (result.ok && result.slide) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onSave?.(result.slide);
    }
  };

  const types: { id: SlideType; label: string; icon: React.ReactNode }[] = [
    { id: "info", label: "Info Slide", icon: <FileText size={14} /> },
    { id: "mcq", label: "MCQ Slide", icon: <ListOrdered size={14} /> },
    { id: "qa", label: "Q&A Slide", icon: <MessageSquare size={14} /> },
  ];

  return (
    <div className={styles.editorWrapper}>
      {/* Top Header: Type Switcher, Pacing Mode, Dirty Status */}
      <div className={styles.topBar}>
        <div className={styles.typeSelectorGroup}>
          <div className={styles.typeTabs} role="tablist" aria-label="Slide Type">
            {types.map((t) => {
              const hasPreserved = hasCachedContent(t.id);
              const isActive = activeType === t.id;

              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => switchType(t.id)}
                  className={`${styles.typeTab} ${
                    isActive ? styles.activeTypeTab : ""
                  }`}
                  title={
                    hasPreserved && !isActive
                      ? `Switch to ${t.label} (preserved draft available)`
                      : `Switch to ${t.label}`
                  }
                >
                  {t.icon}
                  <span>{t.label}</span>
                  {hasPreserved && !isActive && (
                    <span className={styles.preservedPill}>Cached</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className={styles.preservationBanner}>
            <BookmarkCheck size={12} aria-hidden="true" />
            <span>
              Draft state preserved: changing slide type never destroys your
              content.
            </span>
          </div>
        </div>

        {/* Pacing Mode Selector & Dirty State */}
        <div className={styles.metaControls}>
          <div className={styles.pacingToggle}>
            <label htmlFor="pacing-mode-select">Session Pacing:</label>
            <select
              id="pacing-mode-select"
              value={pacingMode}
              onChange={(e) => setPacingMode(e.target.value as PacingMode)}
            >
              <option value="host-paced">Host-Paced</option>
              <option value="participant-paced">Participant-Paced</option>
            </select>
          </div>

          <div
            className={`${styles.statusIndicator} ${
              isDirty ? styles.isDirty : styles.isPristine
            }`}
          >
            {isDirty ? "• Unsaved draft" : "• Draft synced"}
          </div>
        </div>
      </div>

      {/* Type-Specific Active Form */}
      <div className={styles.formContainer}>
        {activeType === "info" && <InfoSlideForm />}
        {activeType === "mcq" && <MCQSlideForm />}
        {activeType === "qa" && <QASlideForm />}
      </div>

      {/* Bottom Action Bar */}
      <div className={styles.actionBar}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {errorCount > 0 && (
            <div className={styles.errorSummaryBadge} role="alert">
              <AlertTriangle size={13} aria-hidden="true" />
              <span>
                {errorCount} {errorCount === 1 ? "field error" : "field errors"}
              </span>
            </div>
          )}

          {saveSuccess && (
            <div className={styles.savedNotice}>
              <Check size={14} aria-hidden="true" />
              <span>Draft saved successfully.</span>
            </div>
          )}
        </div>

        <div className={styles.actionButtons}>
          <button
            type="button"
            onClick={reset}
            className={styles.btnSecondary}
            title="Reset draft to original state"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={errorCount > 0}
            className={styles.btnPrimary}
          >
            <Save size={13} />
            <span>Save Slide</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function SlideEditor({
  initialSlide,
  initialPacingMode = "host-paced",
  onSave,
}: SlideEditorProps) {
  return (
    <SlideDraftProvider
      initialSlide={initialSlide}
      initialPacingMode={initialPacingMode}
    >
      <InnerSlideEditor onSave={onSave} />
    </SlideDraftProvider>
  );
}
