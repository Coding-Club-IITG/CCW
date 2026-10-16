import { PULSE_DEFAULT_MCQ_POINTS, type PulseSlideType } from "@/lib/pulse/constants";
import { normalizeSlideOrder, type PulseSlide } from "@/lib/pulse/deckSchemas";

// Pure, immutable deck operations used by the editor. Inputs are never mutated and no
// function throws: failures come back as typed errors. Order is always renumbered
// 0..n-1 and unaffected slides keep their relative order. MCQ answers are option
// *indexes*, so option edits must go through the MCQ helpers.

export type DeckErrorCode =
  | "SLIDE_NOT_FOUND"
  | "INDEX_OUT_OF_RANGE"
  | "INVALID_SLIDE_TYPE"
  | "WRONG_SLIDE_TYPE";
export type DeckError = { code: DeckErrorCode; message: string };
export type DeckResult<T = object> = ({ ok: true; slides: PulseSlide[] } & T) | { ok: false; error: DeckError };

type McqSlide = Extract<PulseSlide, { type: "mcq" }>;
type SlideContentPatch = Partial<PulseSlide["content"]>;

type IdFactory = () => string;
const newId: IdFactory = () => globalThis.crypto.randomUUID();
const fail = (code: DeckErrorCode, message: string): { ok: false; error: DeckError } => ({ ok: false, error: { code, message } });
const isIndex = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;

export function defaultSlideContent(type: "info"): Extract<PulseSlide, { type: "info" }>["content"];
export function defaultSlideContent(type: "mcq"): McqSlide["content"];
export function defaultSlideContent(type: "qa"): Extract<PulseSlide, { type: "qa" }>["content"];
export function defaultSlideContent(type: PulseSlideType): PulseSlide["content"];
export function defaultSlideContent(type: PulseSlideType): PulseSlide["content"] {
  if (type === "info") return { markdown: "" };
  if (type === "mcq") {
    return { text: "", options: ["", ""], correctOptions: [], multipleAnswers: false, poll: false, points: PULSE_DEFAULT_MCQ_POINTS, timerSeconds: null };
  }
  return { anonymous: false, publicQuestions: false, allowUpvotes: false };
}

const notFound = () => fail("SLIDE_NOT_FOUND", "That slide no longer exists.");
const locate = (slides: readonly PulseSlide[], slideId: string) => {
  const index = slides.findIndex((slide) => slide.slideId === slideId);
  return index < 0 ? null : index;
};
const withOrder = (slides: PulseSlide[]) => normalizeSlideOrder(slides);

export function normalizeOrder(slides: readonly PulseSlide[]): PulseSlide[] {
  return normalizeSlideOrder(slides);
}

/** Inserts a new empty slide at `atIndex` (default: end). */
export function addSlide(
  slides: readonly PulseSlide[],
  type: PulseSlideType,
  atIndex?: number,
  idFactory: IdFactory = newId,
): DeckResult<{ slide: PulseSlide }> {
  if (type !== "info" && type !== "mcq" && type !== "qa") return fail("INVALID_SLIDE_TYPE", "Unknown slide type.");
  const current = normalizeOrder(slides);
  const index = atIndex ?? current.length;
  if (!isIndex(index, current.length)) return fail("INDEX_OUT_OF_RANGE", "That position is outside the deck.");
  const slide = { slideId: idFactory(), order: 0, type, content: defaultSlideContent(type) } as PulseSlide;
  const next = withOrder([...current.slice(0, index), slide, ...current.slice(index)].map((s, order) => ({ ...s, order })));
  return { ok: true, slides: next, slide: next[index] };
}

/** Shallow-merges `patch` into the slide's content. Arrays in the patch replace the old ones. */
export function updateSlide(slides: readonly PulseSlide[], slideId: string, patch: SlideContentPatch): DeckResult {
  const current = normalizeOrder(slides);
  const index = locate(current, slideId);
  if (index === null) return notFound();
  const content = { ...current[index].content, ...structuredClone(patch) };
  return { ok: true, slides: current.map((s, i) => (i === index ? ({ ...s, content } as PulseSlide) : s)) };
}

export function deleteSlide(slides: readonly PulseSlide[], slideId: string): DeckResult<{ deleted: PulseSlide }> {
  const current = normalizeOrder(slides);
  const index = locate(current, slideId);
  if (index === null) return notFound();
  return { ok: true, slides: withOrder(current.filter((_, i) => i !== index)), deleted: current[index] };
}

/** Deep-copies a slide under a new ID, directly after the original. */
export function duplicateSlide(
  slides: readonly PulseSlide[],
  slideId: string,
  idFactory: IdFactory = newId,
): DeckResult<{ slide: PulseSlide }> {
  const current = normalizeOrder(slides);
  const index = locate(current, slideId);
  if (index === null) return notFound();
  const copy = { ...structuredClone(current[index]), slideId: idFactory() } as PulseSlide;
  const next = withOrder([...current.slice(0, index + 1), copy, ...current.slice(index + 1)].map((s, order) => ({ ...s, order })));
  return { ok: true, slides: next, slide: next[index + 1] };
}

/** Moves a slide to `toIndex` (its final position). */
export function reorderSlides(slides: readonly PulseSlide[], slideId: string, toIndex: number): DeckResult {
  const current = normalizeOrder(slides);
  const from = locate(current, slideId);
  if (from === null) return notFound();
  if (!isIndex(toIndex, current.length - 1)) return fail("INDEX_OUT_OF_RANGE", "That position is outside the deck.");
  const rest = current.filter((_, i) => i !== from);
  const moved = [...rest.slice(0, toIndex), current[from], ...rest.slice(toIndex)];
  return { ok: true, slides: withOrder(moved.map((s, order) => ({ ...s, order }))) };
}

/* ---------- MCQ options: keep index-based answers consistent ---------- */

function withMcq(
  slides: readonly PulseSlide[],
  slideId: string,
  edit: (content: McqSlide["content"]) => McqSlide["content"] | { error: DeckError },
): DeckResult {
  const current = normalizeOrder(slides);
  const index = locate(current, slideId);
  if (index === null) return notFound();
  const slide = current[index];
  if (slide.type !== "mcq") return fail("WRONG_SLIDE_TYPE", "Only multiple-choice slides have options.");
  const content = edit(structuredClone(slide.content));
  if ("error" in content) return { ok: false, error: content.error };
  return { ok: true, slides: current.map((s, i) => (i === index ? { ...slide, content } : s)) };
}

export function addMcqOption(slides: readonly PulseSlide[], slideId: string, text = ""): DeckResult {
  return withMcq(slides, slideId, (content) => ({ ...content, options: [...content.options, text] }));
}

/** Removes an option and re-points the correct-answer indexes around it. */
export function removeMcqOption(slides: readonly PulseSlide[], slideId: string, optionIndex: number): DeckResult {
  return withMcq(slides, slideId, (content) => {
    if (!isIndex(optionIndex, content.options.length - 1))
      return { error: { code: "INDEX_OUT_OF_RANGE", message: "That option doesn't exist." } };
    return {
      ...content,
      options: content.options.filter((_, i) => i !== optionIndex),
      correctOptions: content.correctOptions
        .filter((i) => i !== optionIndex)
        .map((i) => (i > optionIndex ? i - 1 : i)),
    };
  });
}

/** Marks or unmarks an option as correct, respecting single vs multiple answers. */
export function setMcqOptionCorrect(slides: readonly PulseSlide[], slideId: string, optionIndex: number, correct: boolean): DeckResult {
  return withMcq(slides, slideId, (content) => {
    if (!isIndex(optionIndex, content.options.length - 1))
      return { error: { code: "INDEX_OUT_OF_RANGE", message: "That option doesn't exist." } };
    const others = content.correctOptions.filter((i) => i !== optionIndex);
    const next = !correct ? others : content.multipleAnswers ? [...others, optionIndex] : [optionIndex];
    return { ...content, correctOptions: next.sort((a, b) => a - b) };
  });
}
