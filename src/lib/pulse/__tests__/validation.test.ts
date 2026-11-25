import { describe, expect, it } from "vitest";
import {
  validateInfoSlide,
  validateMCQSlide,
  validateQASlide,
  validateSlide,
} from "../validation";
import type {
  InfoSlideContent,
  MCQSlideContent,
  QASlideContent,
} from "../types";

describe("Info Slide Validation", () => {
  it("rejects empty markdown content", () => {
    const content: InfoSlideContent = {
      type: "info",
      title: "Valid Title",
      markdown: "   ",
    };
    const errors = validateInfoSlide(content);
    expect(errors.markdown).toBeDefined();
    expect(errors.markdown).toContain("required");
  });

  it("accepts valid markdown and title", () => {
    const content: InfoSlideContent = {
      type: "info",
      title: "Introduction",
      markdown: "## Welcome\nThis is a pulse info slide.",
    };
    const errors = validateInfoSlide(content);
    expect(Object.keys(errors).length).toBe(0);
  });
});

describe("MCQ Slide Validation", () => {
  it("requires a question prompt", () => {
    const content: MCQSlideContent = {
      type: "mcq",
      prompt: "",
      options: [
        { id: "1", text: "Option A", isCorrect: true },
        { id: "2", text: "Option B", isCorrect: false },
      ],
      allowMultipleAnswers: false,
      isPoll: false,
      points: 1000,
      scoringOverride: "standard",
      timeLimitSeconds: 30,
    };
    const errors = validateMCQSlide(content, "host-paced");
    expect(errors.prompt).toBeDefined();
  });

  it("requires at least 2 options", () => {
    const content: MCQSlideContent = {
      type: "mcq",
      prompt: "What is 2+2?",
      options: [{ id: "1", text: "4", isCorrect: true }],
      allowMultipleAnswers: false,
      isPoll: false,
      points: 1000,
      scoringOverride: "standard",
      timeLimitSeconds: 30,
    };
    const errors = validateMCQSlide(content, "host-paced");
    expect(errors.options).toBeDefined();
    expect(errors.options).toContain("At least 2 options");
  });

  it("flags empty option texts with per-option error key", () => {
    const content: MCQSlideContent = {
      type: "mcq",
      prompt: "What is 2+2?",
      options: [
        { id: "1", text: "", isCorrect: true },
        { id: "2", text: "4", isCorrect: false },
      ],
      allowMultipleAnswers: false,
      isPoll: false,
      points: 1000,
      scoringOverride: "standard",
      timeLimitSeconds: 30,
    };
    const errors = validateMCQSlide(content, "host-paced");
    expect(errors["options[0].text"]).toBeDefined();
    expect(errors["options[0].text"]).toContain("cannot be empty");
  });

  it("requires exactly one correct answer in single-choice mode", () => {
    const content: MCQSlideContent = {
      type: "mcq",
      prompt: "Which planet is closest to the sun?",
      options: [
        { id: "1", text: "Mercury", isCorrect: true },
        { id: "2", text: "Venus", isCorrect: true },
      ],
      allowMultipleAnswers: false,
      isPoll: false,
      points: 1000,
      scoringOverride: "standard",
      timeLimitSeconds: 30,
    };
    const errors = validateMCQSlide(content, "host-paced");
    expect(errors.correctAnswer).toBeDefined();
    expect(errors.correctAnswer).toContain("exactly one correct option");
  });

  it("allows multiple correct answers when allowMultipleAnswers is true", () => {
    const content: MCQSlideContent = {
      type: "mcq",
      prompt: "Select all prime numbers:",
      options: [
        { id: "1", text: "2", isCorrect: true },
        { id: "2", text: "3", isCorrect: true },
        { id: "3", text: "4", isCorrect: false },
      ],
      allowMultipleAnswers: true,
      isPoll: false,
      points: 1000,
      scoringOverride: "standard",
      timeLimitSeconds: 30,
    };
    const errors = validateMCQSlide(content, "host-paced");
    expect(errors.correctAnswer).toBeUndefined();
  });

  it("bypasses correct answer requirement when isPoll is true", () => {
    const content: MCQSlideContent = {
      type: "mcq",
      prompt: "What is your favorite beverage?",
      options: [
        { id: "1", text: "Coffee", isCorrect: false },
        { id: "2", text: "Tea", isCorrect: false },
      ],
      allowMultipleAnswers: false,
      isPoll: true,
      points: 0,
      scoringOverride: "none",
      timeLimitSeconds: 30,
    };
    const errors = validateMCQSlide(content, "host-paced");
    expect(errors.correctAnswer).toBeUndefined();
    expect(errors.points).toBeUndefined();
  });

  it("allows per-question timers under host-paced mode", () => {
    const content: MCQSlideContent = {
      type: "mcq",
      prompt: "Question?",
      options: [
        { id: "1", text: "A", isCorrect: true },
        { id: "2", text: "B", isCorrect: false },
      ],
      allowMultipleAnswers: false,
      isPoll: false,
      points: 500,
      scoringOverride: "standard",
      timeLimitSeconds: 45,
    };
    const errors = validateMCQSlide(content, "host-paced");
    expect(errors.timeLimitSeconds).toBeUndefined();
  });

  it("rejects per-question timers under participant-paced mode", () => {
    const content: MCQSlideContent = {
      type: "mcq",
      prompt: "Question?",
      options: [
        { id: "1", text: "A", isCorrect: true },
        { id: "2", text: "B", isCorrect: false },
      ],
      allowMultipleAnswers: false,
      isPoll: false,
      points: 500,
      scoringOverride: "standard",
      timeLimitSeconds: 45,
    };
    const errors = validateMCQSlide(content, "participant-paced");
    expect(errors.timeLimitSeconds).toBeDefined();
    expect(errors.timeLimitSeconds).toContain("only be configured in host-paced mode");
  });
});

describe("Q&A Slide Validation", () => {
  it("validates valid Q&A content", () => {
    const content: QASlideContent = {
      type: "qa",
      prompt: "Ask me anything",
      allowAnonymous: true,
      isPublicVisibility: true,
      allowUpvotes: true,
    };
    const errors = validateQASlide(content);
    expect(Object.keys(errors).length).toBe(0);
  });
});
