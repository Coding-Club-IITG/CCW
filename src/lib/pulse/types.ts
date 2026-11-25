/**
 * Core type definitions for Pulse slide content editing, draft states,
 * pacing modes, and validation.
 */

export type SlideType = "info" | "mcq" | "qa";

export type PacingMode = "host-paced" | "participant-paced";

export type ScoringOverrideType =
  | "standard"
  | "speed_bonus"
  | "flat"
  | "none";

/**
 * Info Slide Content
 */
export interface InfoSlideContent {
  type: "info";
  title?: string;
  markdown: string;
}

/**
 * MCQ Option
 */
export interface MCQOption {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

/**
 * MCQ Slide Content
 */
export interface MCQSlideContent {
  type: "mcq";
  prompt: string;
  options: MCQOption[];
  allowMultipleAnswers: boolean;
  isPoll: boolean;
  points: number;
  scoringOverride: ScoringOverrideType;
  /**
   * Per-question timer in seconds.
   * Only configurable when session is under host-paced mode.
   */
  timeLimitSeconds: number | null;
}

/**
 * Q&A Slide Content
 */
export interface QASlideContent {
  type: "qa";
  prompt?: string;
  allowAnonymous: boolean;
  isPublicVisibility: boolean;
  allowUpvotes: boolean;
}

/**
 * Discriminated union of all slide contents
 */
export type SlideContent = InfoSlideContent | MCQSlideContent | QASlideContent;

/**
 * Slide metadata and wrapper
 */
export interface PulseSlide {
  id: string;
  type: SlideType;
  content: SlideContent;
  title?: string;
  order?: number;
  updatedAt?: string;
}

/**
 * Multi-type draft cache to ensure changing slide type
 * never silently destroys existing user content.
 */
export interface PulseDraftCache {
  info?: InfoSlideContent;
  mcq?: MCQSlideContent;
  qa?: QASlideContent;
}

/**
 * State container for the shared draft system
 */
export interface PulseSlideDraft {
  slideId: string;
  activeType: SlideType;
  content: SlideContent;
  pacingMode: PacingMode;
  cachedByType: PulseDraftCache;
  isDirty: boolean;
  touchedFields: Record<string, boolean>;
  validationErrors: Record<string, string>;
  lastSavedAt?: string;
}

/**
 * Result of slide validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

/**
 * Markdown safety check result
 */
export interface SafeMarkdownCheck {
  isSafe: boolean;
  sanitized: string;
  warnings: string[];
}
