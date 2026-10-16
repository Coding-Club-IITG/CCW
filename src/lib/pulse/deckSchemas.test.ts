import { describe, expect, it } from "vitest";

import { zodIssuesToFields } from "@/lib/api/result";
import { isPulseQuizEditable, PULSE_QUIZ_STATUSES } from "@/lib/pulse/constants";
import {
  defaultPulseConfig,
  normalizeRawSlides,
  normalizeSlideOrder,
  pulseDeckSchema,
  pulseSlideSchema,
  readStoredSlides,
  type PulseSlide,
} from "@/lib/pulse/deckSchemas";

const info = (content: object = {}, over: object = {}) => ({ slideId: "s1", order: 0, type: "info", content: { markdown: "# Hi", ...content }, ...over });
const mcq = (content: object = {}, over: object = {}) => ({
  slideId: "s2", order: 1, type: "mcq",
  content: { text: "2 + 2?", options: ["3", "4"], correctOptions: [1], multipleAnswers: false, poll: false, points: 100, timerSeconds: null, ...content },
  ...over,
});
const qa = (content: object = {}, over: object = {}) => ({
  slideId: "s3", order: 2, type: "qa", content: { anonymous: true, publicQuestions: true, allowUpvotes: true, ...content }, ...over,
});
const deck = (over: Record<string, unknown> = {}) => ({ slides: [info(), mcq(), qa()], ...defaultPulseConfig(), ...over });
function fields(input: unknown) {
  const parsed = pulseDeckSchema.safeParse(input);
  return parsed.success ? {} : zodIssuesToFields(parsed.error.issues);
}

describe("slide schemas", () => {
  it("accepts all three slide types", () => {
    for (const slide of [info(), mcq(), qa()]) expect(pulseSlideSchema.safeParse(slide).success).toBe(true);
  });

  it("rejects unknown types, extra fields and blank content", () => {
    expect(pulseSlideSchema.safeParse({ ...info(), type: "video" }).success).toBe(false);
    expect(pulseSlideSchema.safeParse({ ...info(), title: "x" }).success).toBe(false);
    expect(pulseSlideSchema.safeParse(info({ markdown: "  " })).success).toBe(false);
    expect(pulseSlideSchema.safeParse(info({ extra: 1 })).success).toBe(false);
  });

  it("validates MCQ options and index-based correct answers", () => {
    const ok = (content: object) => pulseSlideSchema.safeParse(mcq(content)).success;
    expect(ok({ options: ["only"], correctOptions: [0] })).toBe(false);
    expect(ok({ options: ["a", ""] })).toBe(false);
    expect(ok({ correctOptions: [] })).toBe(false);
    expect(ok({ correctOptions: [2] })).toBe(false);
    expect(ok({ correctOptions: [-1] })).toBe(false);
    expect(ok({ correctOptions: [0, 1] })).toBe(false);
    expect(ok({ correctOptions: [0, 1], multipleAnswers: true })).toBe(true);
    expect(ok({ correctOptions: [1, 1], multipleAnswers: true })).toBe(false);
    expect(ok({ points: 0 })).toBe(false);
    expect(ok({ points: 1.5 })).toBe(false);
  });

  it("makes polls answerless", () => {
    expect(pulseSlideSchema.safeParse(mcq({ poll: true, correctOptions: [] })).success).toBe(true);
    expect(pulseSlideSchema.safeParse(mcq({ poll: true })).success).toBe(false);
  });
});

describe("deck validation", () => {
  it("accepts a complete deck", () => {
    expect(fields(deck())).toEqual({});
  });

  it("rejects an empty deck and duplicate slide IDs with field paths", () => {
    expect(fields(deck({ slides: [] }))).toHaveProperty("slides");
    expect(fields(deck({ slides: [info(), info({}, { order: 1 })] }))).toHaveProperty(["slides.1.slideId"]);
  });

  it("reports nested slide errors by path", () => {
    expect(fields(deck({ slides: [mcq({ correctOptions: [] })] }))).toHaveProperty(["slides.0.content.correctOptions"]);
    expect(fields(deck({ slides: [mcq({ options: ["", "y"], correctOptions: [1] })] }))).toHaveProperty(["slides.0.content.options.0"]);
  });

  it("checks delivery and navigation compatibility", () => {
    const config = defaultPulseConfig();
    expect(fields(deck({ delivery: { ...config.delivery, navigation: "free" } }))).toHaveProperty(["delivery.navigation"]);
    const paced = deck({
      delivery: { ...config.delivery, mode: "participant-paced", navigation: "free", displayMode: "answer-controller" },
      settings: { ...config.settings, timer: { ...config.settings.timer, perQuestionEnabled: false } },
    });
    expect(fields(paced)).toEqual({ "delivery.displayMode": expect.any(Array) });
  });

  it("checks timer compatibility with the delivery mode", () => {
    const config = defaultPulseConfig();
    const timed = [mcq({ timerSeconds: 30 })];
    expect(fields(deck({ slides: timed }))).toEqual({});
    expect(fields(deck({ slides: [mcq({ timerSeconds: 4 })] }))).toHaveProperty(["slides.0.content.timerSeconds"]);
    const short = { ...config.settings, timer: { ...config.settings.timer, overallDurationSeconds: 60 } };
    expect(fields(deck({ slides: [mcq({ timerSeconds: 90 })], settings: short }))).toHaveProperty(["slides.0.content.timerSeconds"]);
    const off = { ...config.settings, timer: { ...config.settings.timer, perQuestionEnabled: false } };
    expect(fields(deck({ slides: timed, settings: off }))).toHaveProperty(["slides.0.content.timerSeconds"]);
    const participantPaced = { ...config.delivery, mode: "participant-paced" };
    expect(fields(deck({ slides: timed, delivery: participantPaced }))).toHaveProperty(["settings.timer.perQuestionEnabled"]);
    expect(fields(deck({ slides: timed, delivery: participantPaced, settings: off }))).toHaveProperty(["slides.0.content.timerSeconds"]);
  });

  it("checks registration", () => {
    const { registration } = defaultPulseConfig();
    expect(fields(deck({ registration: { ...registration, allowGuests: true } }))).toHaveProperty(["registration.allowGuests"]);
    expect(fields(deck({ registration: { ...registration, maxParticipants: 0 } }))).toHaveProperty(["registration.maxParticipants"]);
    expect(fields(deck({ registration: { ...registration, maxParticipants: 501 } }))).toHaveProperty(["registration.maxParticipants"]);
    expect(fields(deck({ registration: { ...registration, maxParticipants: 500 } }))).toEqual({});
  });

  it("requires showAfterQuestions to name slides of the deck", () => {
    const { settings } = defaultPulseConfig();
    const withList = (showAfterQuestions: string[]) => deck({ settings: { ...settings, leaderboard: { ...settings.leaderboard, showAfterQuestions } } });
    expect(fields(withList(["s2"]))).toEqual({});
    expect(fields(withList(["gone"]))).toHaveProperty(["settings.leaderboard.showAfterQuestions.0"]);
  });

  it("rejects unknown top-level and nested config fields", () => {
    expect(pulseDeckSchema.safeParse({ ...deck(), ownerId: "x" }).success).toBe(false);
    expect(fields(deck({ delivery: { ...defaultPulseConfig().delivery, extra: 1 } }))).not.toEqual({});
  });
});

describe("editable statuses", () => {
  it("allows only draft and scheduled", () => {
    expect(PULSE_QUIZ_STATUSES.filter(isPulseQuizEditable)).toEqual(["draft", "scheduled"]);
  });
});

describe("stored slides", () => {
  it("reads the design-doc example slides unchanged", () => {
    const stored = [
      { slideId: "s1", order: 0, type: "info", content: { markdown: "# Welcome to the Quiz" } },
      { slideId: "s2", order: 1, type: "mcq", content: { text: "What is 2 + 2?", options: ["2", "3", "4", "5"], correctOptions: [2], multipleAnswers: false, poll: false, points: 100 } },
      { slideId: "s3", order: 2, type: "qa", content: { anonymous: true, publicQuestions: true, allowUpvotes: true } },
    ];
    const slides = readStoredSlides(stored);
    expect(slides[1]).toEqual({ ...stored[1], content: { ...stored[1].content, timerSeconds: null } });
    expect(fields({ slides, ...defaultPulseConfig() })).toEqual({});
  });

  it("tolerates Phase 1 placeholders with empty content and out-of-order slides", () => {
    const slides = readStoredSlides([
      { slideId: "b", order: 5, type: "mcq", content: {} },
      { slideId: "a", order: 1, type: "info" },
    ]);
    expect(slides.map((s) => [s.slideId, s.order])).toEqual([["a", 0], ["b", 1]]);
    expect(slides[0]).toMatchObject({ content: { markdown: "" } });
    expect(readStoredSlides(null)).toEqual([]);
  });
});

describe("order normalization", () => {
  it("renumbers 0..n-1 keeping relative order", () => {
    const slides = [{ slideId: "c", order: 9 }, { slideId: "a", order: 2 }, { slideId: "b", order: 2 }] as PulseSlide[];
    expect(normalizeSlideOrder(slides).map((s) => [s.slideId, s.order])).toEqual([["a", 0], ["b", 1], ["c", 2]]);
  });

  it("sorts and renumbers raw client slides, leaving malformed entries for validation", () => {
    const raw = normalizeRawSlides([{ slideId: "b", order: 7 }, { slideId: "a", order: 1 }]);
    expect(raw).toEqual([{ slideId: "a", order: 0 }, { slideId: "b", order: 1 }]);
    expect(normalizeRawSlides(["junk"])).toEqual(["junk"]);
  });
});
