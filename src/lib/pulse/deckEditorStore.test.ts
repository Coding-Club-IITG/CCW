import { describe, expect, it } from "vitest";

import { defaultPulseConfig, type PulseSlide } from "@/lib/pulse/deckSchemas";
import { createDeckEditorStore, isDirty, type DeckSnapshot, type ServerDeck } from "@/lib/pulse/deckEditorStore";

const slides = (): PulseSlide[] => [
  { slideId: "a", order: 0, type: "info", content: { markdown: "# Welcome" } },
  { slideId: "b", order: 1, type: "mcq", content: { text: "2+2?", options: ["3", "4"], correctOptions: [1], multipleAnswers: false, poll: false, points: 100, timerSeconds: null } },
  { slideId: "c", order: 2, type: "qa", content: { anonymous: false, publicQuestions: true, allowUpvotes: true } },
];
const deck = (over: Partial<ServerDeck> = {}): ServerDeck => ({ slides: slides(), ...defaultPulseConfig(), deckVersion: 3, ...over });
const setup = (over: Partial<ServerDeck> = {}, canEdit = true) => {
  const store = createDeckEditorStore(deck(over), { canEdit });
  return { store, a: store.actions, get: store.getState };
};

describe("dirty flag", () => {
  it("is clean on load and dirty after any edit, then clean again when the edit is reverted", () => {
    const { a, get } = setup();
    expect(isDirty(get())).toBe(false);
    a.updateSlide("a", { markdown: "changed" });
    expect(isDirty(get())).toBe(true);
    a.updateSlide("a", { markdown: "# Welcome" });
    expect(isDirty(get())).toBe(false);
  });

  it("tracks structural and config edits", () => {
    const { a, get } = setup();
    a.reorderSlide("c", 0);
    expect(isDirty(get())).toBe(true);
    a.reorderSlide("c", 2);
    expect(isDirty(get())).toBe(false);
    a.updateConfig({ registration: { ...get().draft.registration, maxParticipants: 10 } });
    expect(isDirty(get())).toBe(true);
  });

  it("does not depend on object key order", () => {
    const { store, get } = setup();
    const reverseKeys = (value: unknown): unknown =>
      Array.isArray(value) ? value.map(reverseKeys)
        : value && typeof value === "object"
          ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)])) : value;
    store.setState({ draft: reverseKeys(get().draft) as DeckSnapshot });
    expect(isDirty(get())).toBe(false);
  });

  it("clears only after a server-confirmed save", () => {
    const { a, get } = setup();
    a.updateSlide("a", { markdown: "new" });
    const body = a.beginSave()!;
    expect(isDirty(get())).toBe(true);
    expect(get().save.state).toBe("saving");
    a.saveSucceeded({ ...body, deckVersion: 4 });
    expect(isDirty(get())).toBe(false);
    expect(get()).toMatchObject({ deckVersion: 4, save: { state: "saved" } });
  });
});

describe("explicit save", () => {
  it("sends the draft with the last known version", () => {
    const { a } = setup();
    a.updateSlide("a", { markdown: "x" });
    const body = a.beginSave()!;
    expect(body.deckVersion).toBe(3);
    expect(body.slides[0].content).toEqual({ markdown: "x" });
  });

  it("keeps the draft and maps the error when a save fails, and allows a retry", () => {
    const { a, get } = setup();
    a.updateSlide("a", { markdown: "keep me" });
    a.beginSave();
    a.saveFailed({ code: "PULSE_SAVE_FAILED", message: "boom" });
    expect(get().draft.slides[0].content).toEqual({ markdown: "keep me" });
    expect(isDirty(get())).toBe(true);
    expect(get().save).toMatchObject({ state: "error", code: "PULSE_SAVE_FAILED" });
    expect((get().save as { message: string }).message).toMatch(/still here/);
    expect(a.beginSave()).not.toBeNull();
  });

  it("keeps the server's field errors for the form", () => {
    const { a, get } = setup();
    a.updateSlide("a", { markdown: "x" });
    a.beginSave();
    a.saveFailed({ code: "VALIDATION_ERROR", message: "invalid", fields: { "slides.1.content.text": ["Question is required."] } });
    expect(get().save).toMatchObject({ state: "error", fields: { "slides.1.content.text": ["Question is required."] } });
    a.updateSlide("a", { markdown: "y" });
    expect(get().save.state).toBe("error"); // still visible until the next save
  });

  it("blocks edits while saving and refuses a second concurrent save", () => {
    const { a, get } = setup();
    a.updateSlide("a", { markdown: "x" });
    expect(a.beginSave()).not.toBeNull();
    expect(a.beginSave()).toBeNull();
    expect(a.updateSlide("a", { markdown: "during save" })).toBe(false);
    expect(get().draft.slides[0].content).toEqual({ markdown: "x" });
  });

  it("never autosaves: edits alone leave the status idle", () => {
    const { a, get } = setup();
    a.addSlide("info");
    a.updateSlide("a", { markdown: "x" });
    expect(get().save).toEqual({ state: "idle" });
  });

  it("returns to idle when editing after a successful save", () => {
    const { a, get } = setup();
    a.updateSlide("a", { markdown: "x" });
    a.saveSucceeded({ ...a.beginSave()!, deckVersion: 4 });
    a.updateSlide("a", { markdown: "z" });
    expect(get().save.state).toBe("idle");
  });
});

describe("read-only", () => {
  it("ignores every edit and save when canEdit is false", () => {
    const { a, get } = setup({}, false);
    expect(a.updateSlide("a", { markdown: "x" })).toBe(false);
    expect(a.addSlide("qa")).toBe(false);
    expect(a.deleteSlide("a")).toBe(false);
    expect(a.updateConfig({})).toBe(false);
    expect(a.beginSave()).toBeNull();
    expect(isDirty(get())).toBe(false);
    a.setCanEdit(true);
    expect(a.updateSlide("a", { markdown: "x" })).toBe(true);
  });
});

describe("slide operations through deck.ts", () => {
  it("selects new and duplicated slides and the neighbour of a deleted one", () => {
    const { a, get } = setup();
    a.addSlide("qa", 1);
    expect(get().draft.slides[1].type).toBe("qa");
    expect(get().selectedSlideId).toBe(get().draft.slides[1].slideId);
    a.duplicateSlide("a");
    expect(get().selectedSlideId).toBe(get().draft.slides[1].slideId);
    expect(get().draft.slides.map((s) => s.order)).toEqual([0, 1, 2, 3, 4]);
    a.select("a");
    a.deleteSlide("a");
    expect(get().draft.slides.find((s) => s.slideId === "a")).toBeUndefined();
    expect(get().selectedSlideId).toBe(get().draft.slides[0].slideId);
  });

  it("leaves the draft untouched when an operation is rejected", () => {
    const { a, get } = setup();
    const before = get().draft;
    expect(a.reorderSlide("a", 99)).toBe(false);
    expect(get().draft).toBe(before);
  });

  it("keeps MCQ correct answers consistent when options change", () => {
    const { a, get } = setup();
    a.addMcqOption("b", "5");
    a.removeMcqOption("b", 0);
    expect(get().draft.slides[1].content).toMatchObject({ options: ["4", "5"], correctOptions: [0] });
    a.setMcqOptionCorrect("b", 1, true);
    expect(get().draft.slides[1].content).toMatchObject({ correctOptions: [1] });
  });
});
