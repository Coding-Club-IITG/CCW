import { z } from "zod";

import {
  PULSE_DECK_LIMITS as LIMITS,
  PULSE_DEFAULT_ALLOW_LATE_JOIN,
  PULSE_DEFAULT_MAX_PARTICIPANTS,
  PULSE_DEFAULT_MCQ_POINTS,
  PULSE_DEFAULT_SCORING_MODE,
  PULSE_DELIVERY_MODES,
  PULSE_DISPLAY_MODES,
  PULSE_NAVIGATION_MODES,
  PULSE_SCORING_MODES,
  PULSE_SLIDE_TYPES,
  PULSE_ANSWER_EDIT_MODES,
  PULSE_DEFAULT_ANSWER_EDIT_MODE,
} from "@/lib/pulse/constants";

// Pure Zod and constants only: the server and the browser editor share this file.

const text = (label: string) => z.string().trim().min(1, `${label} is required.`);

/* ---------- Slides ---------- */
// Shape follows the design doc: { slideId, order, type, content }. MCQ options are
// plain strings and correct answers are indexes into them.

const slideBase = {
  slideId: z.string().min(1, "Slide ID is required."),
  order: z.number().int().min(0),
};

export const pulseInfoSlideSchema = z.strictObject({
  ...slideBase,
  type: z.literal("info"),
  content: z.strictObject({
    markdown: z.string().refine((value) => value.trim().length > 0, "Add some content."),
  }),
});

export const pulseMcqContentSchema = z.strictObject({
  text: text("Question"),
  options: z.array(text("Option"))
    .min(LIMITS.minOptions, `Add at least ${LIMITS.minOptions} options.`),
  correctOptions: z.array(z.number().int()),
  multipleAnswers: z.boolean().default(false),
  poll: z.boolean().default(false),
  points: z.number().int()
    .min(1, "Points must be at least 1.")
    .max(LIMITS.maxQuestionPoints, `Points can be at most ${LIMITS.maxQuestionPoints}.`)
    .default(PULSE_DEFAULT_MCQ_POINTS),
  /** Only meaningful in host-paced mode (checked at deck level). */
  timerSeconds: z.number().int()
    .min(LIMITS.minQuestionSeconds, `Timer must be at least ${LIMITS.minQuestionSeconds} seconds.`)
    .nullable().default(null),
}).superRefine((content, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message });
  const correct = content.correctOptions;
  correct.forEach((option, index) => {
    if (option < 0 || option >= content.options.length)
      issue(["correctOptions", index], "Correct answer must be one of the options.");
    else if (correct.indexOf(option) !== index)
      issue(["correctOptions", index], "Correct answers must not repeat.");
  });
  if (content.poll) {
    if (correct.length) issue(["correctOptions"], "A poll has no correct answer.");
  } else if (!correct.length) {
    issue(["correctOptions"], "Choose the correct answer.");
  } else if (!content.multipleAnswers && correct.length > 1) {
    issue(["correctOptions"], "Choose a single correct answer or allow multiple answers.");
  }
});

export const pulseMcqSlideSchema = z.strictObject({
  ...slideBase,
  type: z.literal("mcq"),
  content: pulseMcqContentSchema,
});

export const pulseSlideSchema = z.discriminatedUnion("type", [
  pulseInfoSlideSchema,
  pulseMcqSlideSchema,
]);

export type PulseSlide = z.output<typeof pulseSlideSchema>;

/* ---------- Quiz configuration (kept separate from slide content) ---------- */

export const pulseDeliverySchema = z.strictObject({
  mode: z.enum(PULSE_DELIVERY_MODES).default("host-paced"),
  navigation: z.enum(PULSE_NAVIGATION_MODES).default("sequential"),
  displayMode: z.enum(PULSE_DISPLAY_MODES).default("full-prompt"),
});

export const pulseRegistrationSchema = z.strictObject({
  allowIITGAccounts: z.boolean().default(true),
  allowGuests: z.boolean().default(false),
  maxParticipants: z.number().int().min(1, "Capacity must be at least 1.")
    .max(LIMITS.maxParticipants, `Capacity can be at most ${LIMITS.maxParticipants}.`)
    .default(PULSE_DEFAULT_MAX_PARTICIPANTS),
  allowLateJoin: z.boolean().default(PULSE_DEFAULT_ALLOW_LATE_JOIN),
});

export const pulseSettingsSchema = z.strictObject({
  timer: z.strictObject({
    overallEnabled: z.boolean().default(true),
    overallDurationSeconds: z.number().int().min(1, "Duration must be at least 1 second.").default(3600),
    perQuestionEnabled: z.boolean().default(true),
    /** Quiz-level default stamped onto new MCQ slides; each slide may override it. */
    defaultQuestionSeconds: z.number().int()
      .min(LIMITS.minQuestionSeconds, `Timer must be at least ${LIMITS.minQuestionSeconds} seconds.`)
      .nullable().default(null),
  }).prefault({}),
  // Quiz-wide scoring. `prefault` keeps Phase 2 documents without it readable.
  scoring: z.strictObject({
    mode: z.enum(PULSE_SCORING_MODES).default(PULSE_DEFAULT_SCORING_MODE),
    /** Quiz-level default points for new MCQ slides; each slide may override it. */
    defaultPoints: z.number().int()
      .min(1, "Points must be at least 1.")
      .max(LIMITS.maxQuestionPoints, `Points can be at most ${LIMITS.maxQuestionPoints}.`)
      .default(PULSE_DEFAULT_MCQ_POINTS),
  }).prefault({}),
  answers: z.strictObject({
    editMode: z.enum(PULSE_ANSWER_EDIT_MODES).default(PULSE_DEFAULT_ANSWER_EDIT_MODE),
  }).prefault({}),
  reveal: z.strictObject({
    showCorrectAnswer: z.boolean().default(false),    // per-question feedback (PS §3b)
    showParticipantScore: z.boolean().default(false), // completion display (PS §8)
    showRank: z.boolean().default(false),             // completion display (PS §8)
    showAnswerReview: z.boolean().default(false),     // completion display (PS §8)
  }).prefault({}),
  randomization: z.strictObject({
    enabled: z.boolean().default(false),
    randomizeQuestions: z.boolean().default(false),
    randomizeOptions: z.boolean().default(false),
  }).prefault({}),
  leaderboard: z.strictObject({
    enabled: z.boolean().default(true),
    showAfterQuestions: z.array(z.string()).default([]),
    showManually: z.boolean().default(true),
    showAtEnd: z.boolean().default(true),
  }).prefault({}),
});

export type PulseDelivery = z.output<typeof pulseDeliverySchema>;
export type PulseRegistration = z.output<typeof pulseRegistrationSchema>;
export type PulseSettings = z.output<typeof pulseSettingsSchema>;
export type PulseConfig = {
  delivery: PulseDelivery;
  registration: PulseRegistration;
  settings: PulseSettings;
};

export function defaultPulseConfig() {
  return {
    delivery: pulseDeliverySchema.parse({}),
    registration: pulseRegistrationSchema.parse({}),
    settings: pulseSettingsSchema.parse({}),
  };
}

/* ---------- Whole-deck validation (authoritative on the server) ---------- */

type ConfigIssue = (path: (string | number)[], message: string) => void;

/** Rules that only involve the quiz configuration (shared by deck saves and config copy). */
export function checkConfig(config: { delivery: PulseDelivery; registration: PulseRegistration; settings: PulseSettings }, issue: ConfigIssue) {
  const { delivery, registration, settings } = config;
  const hostPaced = delivery.mode === "host-paced";
  // Host-paced navigation is implicitly sequential.
  if (hostPaced && delivery.navigation === "free")
    issue(["delivery", "navigation"], "Free navigation needs participant-paced delivery.");
  if (!hostPaced && delivery.displayMode === "answer-controller")
    issue(["delivery", "displayMode"], "The answer controller needs host-paced delivery.");
  // Guest participation is deferred (CONTEXT.md).
  if (registration.allowGuests)
    issue(["registration", "allowGuests"], "Guest participation isn't available yet.");
  // Per-question timers are host-paced only.
  if (!hostPaced && settings.timer.perQuestionEnabled)
    issue(["settings", "timer", "perQuestionEnabled"], "Per-question timers are only supported in host-paced mode.");
  // Time-based scoring needs a deadline to measure against: the per-question timer when
  // host-paced, the single shared overall timer when participant-paced.
  if (settings.scoring.mode === "time_based") {
    if (hostPaced && !settings.timer.perQuestionEnabled)
      issue(["settings", "scoring", "mode"], "Time-based scoring needs per-question timers.");
    if (!hostPaced && !settings.timer.overallEnabled)
      issue(["settings", "scoring", "mode"], "Time-based scoring needs the overall timer in participant-paced mode.");
  }
    // PS §4b: a per-participant question order conflicts with one shared current slide.
  if (hostPaced && settings.randomization.enabled && settings.randomization.randomizeQuestions)
    issue(["settings", "randomization", "randomizeQuestions"],
      "Per-participant question order needs participant-paced delivery.");
  // PS §4b: randomized options can't match the shared screen participants answer from.
  if (delivery.displayMode === "answer-controller" && settings.randomization.enabled && settings.randomization.randomizeOptions)
    issue(["settings", "randomization", "randomizeOptions"],
      "Randomized options can't be used with the answer controller.");
  // PS §4b: sequential participant-paced participants cannot revisit earlier slides,
  // so there is no way to reach an earlier answer and change it.
  if (!hostPaced && delivery.navigation === "sequential" && settings.answers.editMode === "editable_until_close")
    issue(["settings", "answers", "editMode"],
      "Response editing needs free navigation in participant-paced mode.");
  // Mirrors the per-slide timer rule for the quiz-level default.
  if (settings.timer.defaultQuestionSeconds !== null && settings.timer.overallEnabled &&
      settings.timer.defaultQuestionSeconds > settings.timer.overallDurationSeconds)
    issue(["settings", "timer", "defaultQuestionSeconds"],
      "The default question timer can't be longer than the overall timer.");
}

/**
 * Forces dependent settings back to valid values after a mode change, so the host never
 * saves a configuration the server will reject. Mirrors `checkConfig` exactly: client
 * reconciles, server validates. Only touches values that would otherwise fail.
 */
export function reconcileConfig<T extends PulseConfig>(config: T): T {
  const hostPaced = config.delivery.mode === "host-paced";
  const delivery: PulseDelivery = {
    ...config.delivery,
    navigation: hostPaced ? "sequential" : config.delivery.navigation,
    displayMode: hostPaced ? config.delivery.displayMode : "full-prompt",
  };
  const timer = {
    ...config.settings.timer,
    perQuestionEnabled: hostPaced && config.settings.timer.perQuestionEnabled,
  };
  const randomization = {
    ...config.settings.randomization,
    randomizeQuestions: hostPaced ? false : config.settings.randomization.randomizeQuestions,
    randomizeOptions: delivery.displayMode === "answer-controller" ? false : config.settings.randomization.randomizeOptions,
  };
  const canEditAnswers = hostPaced || delivery.navigation === "free";
  const answers = {
    ...config.settings.answers,
    editMode: canEditAnswers ? config.settings.answers.editMode : ("locked_on_submit" as const),
  };
  // Time-based scoring needs a deadline: the per-question timer when host-paced,
  // the shared overall timer when participant-paced.
  const hasDeadline = hostPaced ? timer.perQuestionEnabled : timer.overallEnabled;
  const scoring = {
    ...config.settings.scoring,
    mode: hasDeadline ? config.settings.scoring.mode : ("full" as const),
  };
  return {
    ...config,
    delivery,
    settings: { ...config.settings, timer, randomization, answers, scoring },
  };
}

export const pulseConfigSchema = z.strictObject({
  delivery: pulseDeliverySchema,
  registration: pulseRegistrationSchema,
  settings: pulseSettingsSchema,
}).superRefine((config, ctx) => checkConfig(config, (path, message) => ctx.addIssue({ code: "custom", path, message })));

export const pulseDeckSchema = z.strictObject({
  slides: z.array(pulseSlideSchema).min(1, "Add at least one slide before saving."),
  delivery: pulseDeliverySchema,
  registration: pulseRegistrationSchema,
  settings: pulseSettingsSchema,
}).superRefine((deck, ctx) => {
  const issue: ConfigIssue = (path, message) => ctx.addIssue({ code: "custom", path, message });
  const { delivery, settings, slides } = deck;
  checkConfig(deck, issue);
  const hostPaced = delivery.mode === "host-paced";
  const { timer } = settings;

  const slideIds = slides.map((slide) => slide.slideId);
  slides.forEach((slide, index) => {
    if (slideIds.indexOf(slide.slideId) !== index)
      issue(["slides", index, "slideId"], "Slide IDs must be unique.");
  });

  slides.forEach((slide, index) => {
    if (slide.type !== "mcq" || slide.content.timerSeconds === null) return;
    const path = ["slides", index, "content", "timerSeconds"];
    if (!hostPaced) issue(path, "Question timers need host-paced delivery.");
    else if (!timer.perQuestionEnabled) issue(path, "Turn on per-question timers in the quiz settings first.");
    else if (timer.overallEnabled && slide.content.timerSeconds > timer.overallDurationSeconds)
      issue(path, "A question timer can't be longer than the overall timer.");
  });

  // Time-based scoring measures each scored question against its own timer when
  // host-paced, so every non-poll question needs one. (Participant-paced uses the overall timer.)
  if (hostPaced && settings.scoring.mode === "time_based") {
    slides.forEach((slide, index) => {
      if (slide.type === "mcq" && !slide.content.poll && slide.content.timerSeconds === null)
        issue(["slides", index, "content", "timerSeconds"], "Set a timer: time-based scoring needs one on every scored question.");
    });
  }

  // showAfterQuestions lists slide IDs of this deck.
  settings.leaderboard.showAfterQuestions.forEach((slideId, index) => {
    if (!slideIds.includes(slideId))
      issue(["settings", "leaderboard", "showAfterQuestions", index], "Choose a slide from this deck.");
  });
});

/** Order-preserving 0..n-1 renumbering; unaffected slides keep their relative order. */
export function normalizeSlideOrder<T extends { order: number }>(slides: readonly T[]): T[] {
  return slides
    .map((slide, index) => ({ slide, index }))
    .sort((a, b) => a.slide.order - b.slide.order || a.index - b.index)
    .map(({ slide }, order) => ({ ...slide, order }));
}

/** Parses stored delivery/registration/settings, filling defaults for anything missing. */
export function readStoredConfig(raw: { delivery?: unknown; registration?: unknown; settings?: unknown }) {
  const read = <S extends z.ZodType>(schema: S, value: unknown): z.output<S> => {
    const parsed = schema.safeParse(value ?? {});
    return parsed.success ? parsed.data : schema.parse({});
  };
  return {
    delivery: read(pulseDeliverySchema, raw.delivery),
    registration: read(pulseRegistrationSchema, raw.registration),
    settings: read(pulseSettingsSchema, raw.settings),
  };
}

/** Sorts raw client slides by `order` (stable) and renumbers 0..n-1; validation happens afterwards. */
export function normalizeRawSlides(slides: readonly unknown[]): unknown[] {
  const orderOf = (slide: unknown, index: number) => {
    const order = (slide as { order?: unknown } | null)?.order;
    return typeof order === "number" && Number.isFinite(order) ? order : index;
  };
  return slides
    .map((slide, index) => ({ slide, index, order: orderOf(slide, index) }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ slide }, order) =>
      slide && typeof slide === "object" && !Array.isArray(slide) ? { ...slide, order } : slide);
}

/* ---------- Stored documents (Phase 1 containers stay readable) ---------- */

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asBool = (value: unknown) => value === true;

/**
 * Coerces a stored slide to the editor shape. Phase 1 slides were stored with an empty
 * `content`, so missing values become empty defaults instead of failing the load; the
 * editor then reports what the host must fill in. The result is not guaranteed valid.
 */
export function readStoredSlide(stored: object, fallbackOrder = 0): PulseSlide {
  const raw = stored as Record<string, unknown>;
  const content = asRecord(raw.content);
  const slideId = asString(raw.slideId);
  const order = typeof raw.order === "number" ? raw.order : fallbackOrder;
  if (raw.type === "mcq") {
    return {
      slideId, order, type: "mcq",
      content: {
        text: asString(content.text),
        options: Array.isArray(content.options) ? content.options.map(asString) : [],
        correctOptions: Array.isArray(content.correctOptions)
          ? content.correctOptions.filter((n): n is number => typeof n === "number") : [],
        multipleAnswers: asBool(content.multipleAnswers),
        poll: asBool(content.poll),
        points: typeof content.points === "number" ? content.points : PULSE_DEFAULT_MCQ_POINTS,
        timerSeconds: typeof content.timerSeconds === "number" ? content.timerSeconds : null,
      },
    };
  }
  return { slideId, order, type: "info", content: { markdown: asString(content.markdown) } };
}

/**
 * True when a stored deck holds a slide type the editor can't represent (e.g. a `qa`
 * slide, which is out of scope). Such a deck is refused rather than coerced, so an
 * unsupported slide is never silently rewritten or dropped by a save.
 */
export function hasUnsupportedSlides(raw: readonly object[] | undefined | null): boolean {
  return (raw ?? []).some((slide) => !(PULSE_SLIDE_TYPES as readonly unknown[]).includes((slide as { type?: unknown }).type));
}

export function readStoredSlides(raw: readonly object[] | undefined | null): PulseSlide[] {
  return normalizeSlideOrder((raw ?? []).map((slide, index) => readStoredSlide(slide, index)));
}
