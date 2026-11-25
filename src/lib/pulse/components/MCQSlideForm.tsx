"use client";

import React from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  HelpCircle,
  Info,
  Plus,
  Trash2,
  Trophy,
} from "lucide-react";
import {
  DEFAULT_POINTS,
  DEFAULT_TIMER_SECONDS,
  MAX_MCQ_OPTIONS,
  MAX_OPTION_TEXT_LENGTH,
  MAX_PROMPT_LENGTH,
  MAX_TIMER_SECONDS,
  MIN_MCQ_OPTIONS,
  MIN_TIMER_SECONDS,
  POINTS_PRESETS,
  TIMER_PRESETS,
} from "../constants";
import type { MCQSlideContent, ScoringOverrideType } from "../types";
import { useSlideDraft } from "../useSlideDraft";
import { FieldError } from "./FieldError";
import styles from "./styles/MCQSlideForm.module.scss";

const SCORING_OPTIONS: { id: ScoringOverrideType; label: string; desc: string }[] =
  [
    {
      id: "standard",
      label: "Standard Scoring",
      desc: "Full points awarded for correct responses.",
    },
    {
      id: "speed_bonus",
      label: "Speed Bonus",
      desc: "Faster correct answers earn additional points.",
    },
    {
      id: "flat",
      label: "Flat Scoring",
      desc: "Fixed points awarded regardless of difficulty.",
    },
    {
      id: "none",
      label: "No Points / Practice",
      desc: "Participant responses are tracked without score.",
    },
  ];

export function MCQSlideForm() {
  const {
    content,
    updateContent,
    pacingMode,
    errors,
    setMCQOption,
    addMCQOption,
    removeMCQOption,
    reorderMCQOptions,
    markTouched,
  } = useSlideDraft();

  const mcq = content as MCQSlideContent;
  const isHostPaced = pacingMode === "host-paced";

  // Prompt handlers
  const handlePromptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateContent((prev) => ({
      ...prev,
      prompt: e.target.value,
    }));
  };

  // Poll toggle
  const handlePollToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isPoll = e.target.checked;
    updateContent((prev) => {
      const current = prev as MCQSlideContent;
      return {
        ...current,
        isPoll,
        // When entering poll mode, we don't score points
        points: isPoll ? 0 : current.points || DEFAULT_POINTS,
      };
    });
  };

  // Multiple answers toggle
  const handleMultipleAnswersToggle = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const allowMultipleAnswers = e.target.checked;
    updateContent((prev) => {
      const current = prev as MCQSlideContent;
      const options = [...current.options];
      // If switching from multiple to single, ensure at most one correct option is selected
      if (!allowMultipleAnswers) {
        let foundFirst = false;
        options.forEach((opt, idx) => {
          if (opt.isCorrect) {
            if (!foundFirst) {
              foundFirst = true;
            } else {
              options[idx] = { ...opt, isCorrect: false };
            }
          }
        });
      }
      return {
        ...current,
        allowMultipleAnswers,
        options,
      };
    });
  };

  // Correct answer toggle handler
  const handleCorrectToggle = (index: number) => {
    if (mcq.isPoll) return;

    if (mcq.allowMultipleAnswers) {
      setMCQOption(index, { isCorrect: !mcq.options[index]?.isCorrect });
    } else {
      // Radio mode: unselect all others and set this one
      setMCQOption(index, { isCorrect: true });
    }
  };

  // Option text change handler
  const handleOptionTextChange = (index: number, text: string) => {
    setMCQOption(index, { text });
  };

  // Points handler
  const handlePointsChange = (points: number) => {
    updateContent((prev) => ({
      ...prev,
      points,
    }));
  };

  // Scoring override handler
  const handleScoringChange = (scoringOverride: ScoringOverrideType) => {
    updateContent((prev) => ({
      ...prev,
      scoringOverride,
    }));
  };

  // Per-question timer handler
  const handleTimerToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isHostPaced) return;
    const enabled = e.target.checked;
    updateContent((prev) => ({
      ...prev,
      timeLimitSeconds: enabled ? DEFAULT_TIMER_SECONDS : null,
    }));
  };

  const handleTimerDurationChange = (seconds: number | null) => {
    if (!isHostPaced) return;
    updateContent((prev) => ({
      ...prev,
      timeLimitSeconds: seconds,
    }));
  };

  return (
    <div className={styles.mcqForm}>
      {/* Question Prompt */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <label htmlFor="mcq-prompt">Question Prompt</label>
          <span className={styles.charCount}>
            {(mcq.prompt || "").length}/{MAX_PROMPT_LENGTH}
          </span>
        </div>
        <div className={styles.fieldGroup}>
          <input
            id="mcq-prompt"
            type="text"
            value={mcq.prompt || ""}
            onChange={handlePromptChange}
            onBlur={() => markTouched("prompt")}
            placeholder="Type your question or statement..."
            maxLength={MAX_PROMPT_LENGTH}
            className={`${styles.textInput} ${
              errors.prompt ? styles.hasError : ""
            }`}
            aria-invalid={Boolean(errors.prompt)}
            aria-describedby={errors.prompt ? "mcq-prompt-error" : undefined}
          />
          <FieldError id="mcq-prompt-error" error={errors.prompt} />
        </div>
      </div>

      {/* Settings Row: Poll Mode & Multiple Answers */}
      <div className={styles.settingsCard}>
        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={mcq.isPoll}
            onChange={handlePollToggle}
            className={styles.checkbox}
          />
          <div className={styles.toggleText}>
            <span className={styles.toggleTitle}>Poll Mode</span>
            <span className={styles.toggleDesc}>
              Collect audience opinions without correct answers or scoring.
            </span>
          </div>
        </label>

        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={mcq.allowMultipleAnswers}
            onChange={handleMultipleAnswersToggle}
            className={styles.checkbox}
          />
          <div className={styles.toggleText}>
            <span className={styles.toggleTitle}>
              {mcq.isPoll ? "Multiple Choices Allowed" : "Multiple Correct Answers"}
            </span>
            <span className={styles.toggleDesc}>
              {mcq.isPoll
                ? "Allow participants to select more than one choice."
                : "Allow more than one option to be marked as correct."}
            </span>
          </div>
        </label>
      </div>

      {/* Answer Options Management */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <span>
            {mcq.isPoll ? "Poll Choices" : "Answer Options"} (
            {mcq.options.length}/{MAX_MCQ_OPTIONS})
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
            {!mcq.isPoll &&
              (mcq.allowMultipleAnswers
                ? "Check all correct options"
                : "Select the single correct option")}
          </span>
        </div>

        <div className={styles.optionsList}>
          {mcq.options.map((option, idx) => {
            const letter = String.fromCharCode(65 + idx);
            const optErrorKey = `options[${idx}].text`;
            const optError = errors[optErrorKey];

            return (
              <div key={option.id || idx} className={styles.optionRow}>
                <div className={styles.optionInputGroup}>
                  {/* Correct Option Selector or Poll Choice Badge */}
                  {mcq.isPoll ? (
                    <div
                      className={`${styles.correctSelector} ${styles.isPollMode}`}
                      title={`Choice ${letter}`}
                    >
                      {letter}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCorrectToggle(idx)}
                      className={`${styles.correctSelector} ${
                        option.isCorrect ? styles.isCorrect : ""
                      }`}
                      title={
                        option.isCorrect
                          ? `Option ${letter} is marked correct (click to change)`
                          : `Mark Option ${letter} as correct`
                      }
                      aria-label={`Mark Option ${letter} as correct`}
                    >
                      <input
                        type={mcq.allowMultipleAnswers ? "checkbox" : "radio"}
                        name="mcq-correct-selector"
                        checked={Boolean(option.isCorrect)}
                        onChange={() => handleCorrectToggle(idx)}
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                    </button>
                  )}

                  {/* Option Text Input */}
                  <input
                    type="text"
                    value={option.text}
                    onChange={(e) =>
                      handleOptionTextChange(idx, e.target.value)
                    }
                    onBlur={() => markTouched(optErrorKey)}
                    placeholder={`Option ${letter}`}
                    maxLength={MAX_OPTION_TEXT_LENGTH}
                    className={`${styles.textInput} ${
                      optError ? styles.hasError : ""
                    }`}
                    aria-invalid={Boolean(optError)}
                    aria-describedby={
                      optError ? `option-${idx}-error` : undefined
                    }
                  />

                  {/* Reorder Buttons */}
                  <div className={styles.orderButtons}>
                    <button
                      type="button"
                      onClick={() => reorderMCQOptions(idx, idx - 1)}
                      disabled={idx === 0}
                      className={styles.orderBtn}
                      title="Move up"
                      aria-label={`Move option ${letter} up`}
                    >
                      <ChevronUp size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => reorderMCQOptions(idx, idx + 1)}
                      disabled={idx === mcq.options.length - 1}
                      className={styles.orderBtn}
                      title="Move down"
                      aria-label={`Move option ${letter} down`}
                    >
                      <ChevronDown size={12} />
                    </button>
                  </div>

                  {/* Remove Option Button */}
                  <button
                    type="button"
                    onClick={() => removeMCQOption(idx)}
                    disabled={mcq.options.length <= MIN_MCQ_OPTIONS}
                    className={styles.removeOptionBtn}
                    title={
                      mcq.options.length <= MIN_MCQ_OPTIONS
                        ? `At least ${MIN_MCQ_OPTIONS} options are required`
                        : `Remove option ${letter}`
                    }
                    aria-label={`Remove option ${letter}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Per-option validation error displayed directly next to/below this option */}
                <FieldError id={`option-${idx}-error`} error={optError} />
              </div>
            );
          })}
        </div>

        {/* Global Options Errors */}
        <FieldError error={errors.options} />
        {!mcq.isPoll && <FieldError error={errors.correctAnswer} />}

        {/* Add Option Button */}
        {mcq.options.length < MAX_MCQ_OPTIONS && (
          <button
            type="button"
            onClick={() => addMCQOption("")}
            className={styles.addOptionBtn}
          >
            <Plus size={14} />
            <span>Add Option</span>
          </button>
        )}
      </div>

      {/* Two Column Grid: Scoring & Per-Question Timer Configuration */}
      <div className={styles.twoColGrid}>
        {/* Points & Scoring Overrides Configuration */}
        <div
          className={`${styles.configCard} ${
            mcq.isPoll ? styles.disabledCard : ""
          }`}
        >
          <div className={styles.sectionHeader}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Trophy size={14} />
              Points & Scoring
            </span>
          </div>

          {mcq.isPoll ? (
            <div className={styles.pollNotice}>
              Scoring is disabled while in Poll Mode.
            </div>
          ) : (
            <>
              {/* Points Configuration */}
              <div className={styles.fieldGroup}>
                <label
                  htmlFor="mcq-points"
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--foreground-muted)",
                  }}
                >
                  Points for Correct Answer
                </label>
                <input
                  id="mcq-points"
                  type="number"
                  min={0}
                  step={50}
                  value={mcq.points}
                  onChange={(e) =>
                    handlePointsChange(parseInt(e.target.value, 10) || 0)
                  }
                  onBlur={() => markTouched("points")}
                  className={`${styles.textInput} ${
                    errors.points ? styles.hasError : ""
                  }`}
                  aria-invalid={Boolean(errors.points)}
                  aria-describedby={errors.points ? "mcq-points-error" : undefined}
                />
                <FieldError id="mcq-points-error" error={errors.points} />

                {/* Quick Presets */}
                <div className={styles.pillsRow}>
                  {POINTS_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handlePointsChange(preset)}
                      className={`${styles.presetPill} ${
                        mcq.points === preset ? styles.activePill : ""
                      }`}
                    >
                      {preset} pts
                    </button>
                  ))}
                </div>
              </div>

              {/* Scoring Override Selection */}
              <div className={styles.fieldGroup}>
                <label
                  htmlFor="mcq-scoring-override"
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--foreground-muted)",
                  }}
                >
                  Scoring Rule Override
                </label>
                <select
                  id="mcq-scoring-override"
                  value={mcq.scoringOverride || "standard"}
                  onChange={(e) =>
                    handleScoringChange(
                      e.target.value as ScoringOverrideType,
                    )
                  }
                  className={styles.textInput}
                >
                  {SCORING_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label} — {opt.desc}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {/* Per-Question Timer Configuration */}
        {/* Requirement: "Per-question timers are only configurable when meaningful under host-paced mode." */}
        <div
          className={`${styles.configCard} ${
            !isHostPaced ? styles.disabledCard : ""
          }`}
        >
          <div className={styles.sectionHeader}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Clock size={14} />
              Per-Question Timer
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                color: isHostPaced ? "var(--brand-lime)" : "var(--brand-sky)",
              }}
            >
              Mode: {isHostPaced ? "Host-Paced" : "Participant-Paced"}
            </span>
          </div>

          {!isHostPaced ? (
            /* Participant-paced mode: timers are not meaningful */
            <div className={styles.pacingNotice}>
              <Info size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Timer Disabled:</strong> Per-question timers are only
                configurable and active in <em>host-paced mode</em>. In
                participant-paced mode, participants progress through slides at
                their own speed.
              </div>
            </div>
          ) : (
            /* Host-paced mode: timers are fully configurable */
            <>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={mcq.timeLimitSeconds !== null}
                  onChange={handleTimerToggle}
                  className={styles.checkbox}
                />
                <div className={styles.toggleText}>
                  <span className={styles.toggleTitle}>
                    Enable Countdown Timer
                  </span>
                  <span className={styles.toggleDesc}>
                    Automatically close submissions when time expires on this
                    slide.
                  </span>
                </div>
              </label>

              {mcq.timeLimitSeconds !== null && (
                <div className={styles.fieldGroup}>
                  <label
                    htmlFor="mcq-timer-seconds"
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--foreground-muted)",
                    }}
                  >
                    Duration (Seconds)
                  </label>
                  <input
                    id="mcq-timer-seconds"
                    type="number"
                    min={MIN_TIMER_SECONDS}
                    max={MAX_TIMER_SECONDS}
                    value={mcq.timeLimitSeconds}
                    onChange={(e) =>
                      handleTimerDurationChange(
                        parseInt(e.target.value, 10) || null,
                      )
                    }
                    onBlur={() => markTouched("timeLimitSeconds")}
                    className={`${styles.textInput} ${
                      errors.timeLimitSeconds ? styles.hasError : ""
                    }`}
                    aria-invalid={Boolean(errors.timeLimitSeconds)}
                    aria-describedby={
                      errors.timeLimitSeconds
                        ? "mcq-timer-error"
                        : undefined
                    }
                  />
                  <FieldError
                    id="mcq-timer-error"
                    error={errors.timeLimitSeconds}
                  />

                  {/* Quick Presets */}
                  <div className={styles.pillsRow}>
                    {TIMER_PRESETS.map((seconds) => (
                      <button
                        key={seconds}
                        type="button"
                        onClick={() => handleTimerDurationChange(seconds)}
                        className={`${styles.presetPill} ${
                          mcq.timeLimitSeconds === seconds
                            ? styles.activePill
                            : ""
                        }`}
                      >
                        {seconds}s
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
