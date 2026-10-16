import { createStore } from "zustand/vanilla";

import { pulseErrorMessage, type PulseSlideType } from "@/lib/pulse/constants";
import {
  addMcqOption,
  addSlide,
  deleteSlide,
  duplicateSlide,
  removeMcqOption,
  reorderSlides,
  setMcqOptionCorrect,
  updateSlide,
  type DeckResult,
} from "@/lib/pulse/deck";
import type { PulseDelivery, PulseRegistration, PulseSettings, PulseSlide } from "@/lib/pulse/deckSchemas";

/** Everything a save writes. Slide edits go through deck.ts; config edits replace whole sections. */
export type DeckSnapshot = {
  slides: PulseSlide[];
  delivery: PulseDelivery;
  registration: PulseRegistration;
  settings: PulseSettings;
};

export type SaveState =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; code: string; message: string; fields: Record<string, string[]> };

export type EditorState = {
  /** Last successfully saved (or loaded) deck. */
  saved: DeckSnapshot;
  /** What the host is editing. */
  draft: DeckSnapshot;
  deckVersion: number;
  canEdit: boolean;
  selectedSlideId: string | null;
  save: SaveState;
};

export type ServerDeck = DeckSnapshot & { deckVersion: number };
export type SaveBody = DeckSnapshot & { deckVersion: number };

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** True when the draft differs from the last successful save. */
export const isDirty = (state: Pick<EditorState, "saved" | "draft">) => !deepEqual(state.draft, state.saved);

const snapshotOf = (deck: DeckSnapshot): DeckSnapshot => structuredClone({
  slides: deck.slides, delivery: deck.delivery, registration: deck.registration, settings: deck.settings,
});

export function createDeckEditorStore(initial: ServerDeck, options: { canEdit?: boolean } = {}) {
  const base = snapshotOf(initial);
  const store = createStore<EditorState>(() => ({
    saved: base,
    draft: snapshotOf(base),
    deckVersion: initial.deckVersion,
    canEdit: options.canEdit ?? false,
    selectedSlideId: base.slides[0]?.slideId ?? null,
    save: { state: "idle" },
  }));
  const { getState, setState } = store;

  // Editing is blocked while read-only or while a save is in flight, so a save always
  // writes exactly what the host saw.
  const editable = () => getState().canEdit && getState().save.state !== "saving";
  // A successful save no longer describes the draft once it changes; errors stay visible.
  const afterEdit = (save: SaveState): SaveState => (save.state === "saved" ? { state: "idle" } : save);

  function applySlides(run: (slides: PulseSlide[]) => DeckResult, select?: (result: DeckResult & { ok: true }) => string | null | undefined) {
    if (!editable()) return false;
    const state = getState();
    const result = run(state.draft.slides);
    if (!result.ok) return false;
    const chosen = select?.(result) ?? state.selectedSlideId;
    setState({
      draft: { ...state.draft, slides: result.slides },
      selectedSlideId: result.slides.some((s) => s.slideId === chosen) ? chosen : (result.slides[0]?.slideId ?? null),
      save: afterEdit(state.save),
    });
    return true;
  }

  const actions = {
    select(slideId: string) {
      if (getState().draft.slides.some((s) => s.slideId === slideId)) setState({ selectedSlideId: slideId });
    },
    setCanEdit(canEdit: boolean) {
      if (getState().canEdit !== canEdit) setState({ canEdit });
    },

    addSlide(type: PulseSlideType, atIndex?: number) {
      return applySlides((slides) => addSlide(slides, type, atIndex), (r) => ("slide" in r ? (r.slide as PulseSlide).slideId : null));
    },
    updateSlide(slideId: string, patch: Parameters<typeof updateSlide>[2]) {
      return applySlides((slides) => updateSlide(slides, slideId, patch));
    },
    deleteSlide(slideId: string) {
      const { draft, selectedSlideId } = getState();
      const index = draft.slides.findIndex((s) => s.slideId === slideId);
      const neighbour = draft.slides[index + 1] ?? draft.slides[index - 1];
      return applySlides((slides) => deleteSlide(slides, slideId), () => (selectedSlideId === slideId ? (neighbour?.slideId ?? null) : selectedSlideId));
    },
    duplicateSlide(slideId: string) {
      return applySlides((slides) => duplicateSlide(slides, slideId), (r) => ("slide" in r ? (r.slide as PulseSlide).slideId : null));
    },
    reorderSlide(slideId: string, toIndex: number) {
      return applySlides((slides) => reorderSlides(slides, slideId, toIndex));
    },
    addMcqOption(slideId: string, text = "") {
      return applySlides((slides) => addMcqOption(slides, slideId, text));
    },
    removeMcqOption(slideId: string, optionIndex: number) {
      return applySlides((slides) => removeMcqOption(slides, slideId, optionIndex));
    },
    setMcqOptionCorrect(slideId: string, optionIndex: number, correct: boolean) {
      return applySlides((slides) => setMcqOptionCorrect(slides, slideId, optionIndex, correct));
    },

    /** Replaces whole config sections (used by the settings panel and by config copy). */
    updateConfig(patch: Partial<Pick<DeckSnapshot, "delivery" | "registration" | "settings">>) {
      if (!editable()) return false;
      const state = getState();
      setState({ draft: { ...state.draft, ...structuredClone(patch) }, save: afterEdit(state.save) });
      return true;
    },

    /** Marks a save as started and returns the body to send, or null when saving isn't possible. */
    beginSave(): SaveBody | null {
      const state = getState();
      if (!state.canEdit || state.save.state === "saving") return null;
      setState({ save: { state: "saving" } });
      return { ...structuredClone(state.draft), deckVersion: state.deckVersion };
    },
    /** Only a server-confirmed save moves the baseline and clears the dirty state. */
    saveSucceeded(deck: ServerDeck) {
      const next = snapshotOf(deck);
      const { selectedSlideId } = getState();
      setState({
        saved: next, draft: snapshotOf(next), deckVersion: deck.deckVersion,
        selectedSlideId: next.slides.some((s) => s.slideId === selectedSlideId) ? selectedSlideId : (next.slides[0]?.slideId ?? null),
        save: { state: "saved" },
      });
    },
    /** A failed save always keeps the draft untouched, so the host can retry. */
    saveFailed(error: { code: string; message: string; fields?: Record<string, string[]> }) {
      setState({
        save: {
          state: "error", code: error.code, fields: error.fields ?? {},
          message: pulseErrorMessage({ code: error.code, message: error.message, fields: error.fields }),
        },
      });
    },
  };

  return Object.assign(store, { actions });
}

export type DeckEditorStore = ReturnType<typeof createDeckEditorStore>;
