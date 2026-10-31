/**
 * Validation rules and schemas for Pulse slide forms.
 * Produces structured, field-specific error maps so errors appear
 * directly adjacent to their relevant input fields.
 */

import {
  MAX_INFO_MARKDOWN_LENGTH,
  MAX_MCQ_OPTIONS,
  MAX_OPTION_TEXT_LENGTH,
  MAX_PROMPT_LENGTH,
  MAX_TIMER_SECONDS,
  MAX_TITLE_LENGTH,
  MIN_MCQ_OPTIONS,
  MIN_TIMER_SECONDS,
} from "./constants";
import type {
  InfoSlideContent,
  MCQSlideContent,
  PacingMode,
  QASlideContent,
  SlideContent,
  SlideType,
  ValidationResult,
} from "./types";

/**
 * Validates an Info Slide.
 */
export function validateInfoSlide(content: InfoSlideContent): Record<string, string> {
  const errors: Record<string, string> = {};

  if (content.title && content.title.length > MAX_TITLE_LENGTH) {
    errors.title = `Title must not exceed ${MAX_TITLE_LENGTH} characters.`;
  }

  const rawMarkdown = content.markdown ?? "";
  if (!rawMarkdown.trim()) {
    errors.markdown = "Markdown content is required.";
  } else if (rawMarkdown.length > MAX_INFO_MARKDOWN_LENGTH) {
    errors.markdown = `Content must not exceed ${MAX_INFO_MARKDOWN_LENGTH.toLocaleString()} characters.`;
  }

  return errors;
}

/**
 * Validates an MCQ Slide.
 * Respects poll settings and validates per-question timers only under host-paced mode.
 */
export function validateMCQSlide(
  content: MCQSlideContent,
  pacingMode: PacingMode = "host-paced",
): Record<string, string> {
  const errors: Record<string, string> = {};

  // Prompt validation
  const prompt = content.prompt ?? "";
  if (!prompt.trim()) {
    errors.prompt = "Question prompt is required.";
  } else if (prompt.length > MAX_PROMPT_LENGTH) {
    errors.prompt = `Prompt must not exceed ${MAX_PROMPT_LENGTH} characters.`;
  }

  // Options count validation
  const options = content.options ?? [];
  if (options.length < MIN_MCQ_OPTIONS) {
    errors.options = `At least ${MIN_MCQ_OPTIONS} options are required.`;
  } else if (options.length > MAX_MCQ_OPTIONS) {
    errors.options = `Maximum ${MAX_MCQ_OPTIONS} options allowed.`;
  }

  // Per-option text validation
  const seenTexts = new Set<string>();
  let hasDuplicate = false;

  options.forEach((opt, idx) => {
    const text = opt.text ?? "";
    const key = `options[${idx}].text`;

    if (!text.trim()) {
      errors[key] = `Option ${idx + 1} text cannot be empty.`;
    } else if (text.length > MAX_OPTION_TEXT_LENGTH) {
      errors[key] = `Option ${idx + 1} must not exceed ${MAX_OPTION_TEXT_LENGTH} characters.`;
    }

    const normalized = text.trim().toLowerCase();
    if (normalized) {
      if (seenTexts.has(normalized) && !hasDuplicate) {
        hasDuplicate = true;
      }
      seenTexts.add(normalized);
    }
  });

  if (hasDuplicate && !errors.options) {
    errors.options = "Option texts should be unique.";
  }

  // Correct answer validation (only applies when NOT a poll)
  if (!content.isPoll) {
    const correctCount = options.filter((o) => o.isCorrect).length;

    if (correctCount === 0) {
      errors.correctAnswer = "Select at least one correct option.";
    } else if (!content.allowMultipleAnswers && correctCount > 1) {
      errors.correctAnswer =
        "Single-choice questions must have exactly one correct option.";
    }

    // Points validation
    if (typeof content.points !== "number" || isNaN(content.points)) {
      errors.points = "Points must be a valid number.";
    } else if (content.points < 0) {
      errors.points = "Points cannot be negative.";
    } else if (!Number.isInteger(content.points)) {
      errors.points = "Points must be a whole integer.";
    }
  }

  // Per-question timer validation (conditioned on pacingMode)
  if (pacingMode === "host-paced") {
    if (content.timeLimitSeconds !== null && content.timeLimitSeconds !== undefined) {
      if (
        !Number.isInteger(content.timeLimitSeconds) ||
        content.timeLimitSeconds < MIN_TIMER_SECONDS ||
        content.timeLimitSeconds > MAX_TIMER_SECONDS
      ) {
        errors.timeLimitSeconds = `Timer must be an integer between ${MIN_TIMER_SECONDS}s and ${MAX_TIMER_SECONDS}s.`;
      }
    }
  } else {
    // Participant-paced: timers are not meaningful
    if (content.timeLimitSeconds !== null && content.timeLimitSeconds !== undefined) {
      errors.timeLimitSeconds =
        "Per-question timers can only be configured in host-paced mode.";
    }
  }

  return errors;
}

/**
 * Validates a Q&A Slide.
 */
export function validateQASlide(content: QASlideContent): Record<string, string> {
  const errors: Record<string, string> = {};

  if (content.prompt && content.prompt.length > MAX_PROMPT_LENGTH) {
    errors.prompt = `Prompt must not exceed ${MAX_PROMPT_LENGTH} characters.`;
  }

  return errors;
}

/**
 * Universal slide validator.
 */
export function validateSlide(
  type: SlideType,
  content: SlideContent,
  pacingMode: PacingMode = "host-paced",
): ValidationResult {
  let errors: Record<string, string> = {};

  switch (type) {
    case "info":
      if (content.type === "info") {
        errors = validateInfoSlide(content);
      } else {
        errors._form = "Invalid content for Info slide.";
      }
      break;

    case "mcq":
      if (content.type === "mcq") {
        errors = validateMCQSlide(content, pacingMode);
      } else {
        errors._form = "Invalid content for MCQ slide.";
      }
      break;

    case "qa":
      if (content.type === "qa") {
        errors = validateQASlide(content);
      } else {
        errors._form = "Invalid content for Q&A slide.";
      }
      break;

    default:
      errors._form = `Unknown slide type: ${type}`;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
