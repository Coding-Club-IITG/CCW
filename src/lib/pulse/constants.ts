import type {
  InfoSlideContent,
  MCQSlideContent,
  QASlideContent,
  SlideType,
} from "./types";

export const MIN_MCQ_OPTIONS = 2;
export const MAX_MCQ_OPTIONS = 10;

export const DEFAULT_POINTS = 1000;
export const POINTS_PRESETS = [100, 250, 500, 1000, 2000] as const;

export const MIN_TIMER_SECONDS = 5;
export const MAX_TIMER_SECONDS = 600;
export const DEFAULT_TIMER_SECONDS = 30;
export const TIMER_PRESETS = [10, 20, 30, 45, 60, 90, 120] as const;

export const MAX_TITLE_LENGTH = 120;
export const MAX_PROMPT_LENGTH = 500;
export const MAX_OPTION_TEXT_LENGTH = 200;
export const MAX_MARKDOWN_LENGTH = 20000;

export const DEFAULT_INFO_CONTENT: InfoSlideContent = {
  type: "info",
  title: "",
  markdown: "# Slide Title\n\nAdd your informational text, math formulas, and formatting here.",
};

export const DEFAULT_MCQ_CONTENT: MCQSlideContent = {
  type: "mcq",
  prompt: "What is your question?",
  options: [
    { id: "opt-1", text: "Option 1", isCorrect: true },
    { id: "opt-2", text: "Option 2", isCorrect: false },
  ],
  allowMultipleAnswers: false,
  isPoll: false,
  points: DEFAULT_POINTS,
  scoringOverride: "standard",
  timeLimitSeconds: DEFAULT_TIMER_SECONDS,
};

export const DEFAULT_QA_CONTENT: QASlideContent = {
  type: "qa",
  prompt: "Questions & Answers",
  allowAnonymous: true,
  isPublicVisibility: true,
  allowUpvotes: true,
};

export function getDefaultContentForType(type: SlideType) {
  switch (type) {
    case "info":
      return { ...DEFAULT_INFO_CONTENT };
    case "mcq":
      return {
        ...DEFAULT_MCQ_CONTENT,
        options: DEFAULT_MCQ_CONTENT.options.map((opt) => ({ ...opt })),
      };
    case "qa":
      return { ...DEFAULT_QA_CONTENT };
  }
}
