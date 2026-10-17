import { describe, expect, it } from "vitest";

import {
  addMcqOption,
  addSlide,
  defaultSlideContent,
  deleteSlide,
  duplicateSlide,
  normalizeOrder,
  removeMcqOption,
  reorderSlides,
  setMcqOptionCorrect,
  updateSlide,
  type DeckResult,
} from "@/lib/pulse/deck";
import type { PulseSlide } from "@/lib/pulse/deckSchemas";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function ok<T extends object>(result: DeckResult<T>) {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result;
}
const ids = (slides: readonly PulseSlide[]) => slides.map((s) => s.slideId);
let counter = 0;
const seq = () => `id-${++counter}`;

function deckOf(...types: ("info" | "mcq")[]): PulseSlide[] {
  return freeze(types.reduce<PulseSlide[]>((slides, type) => ok(addSlide(slides, type, undefined, seq)).slides, []));
}

describe("addSlide", () => {
  it("creates empty slides of each type with normalized order", () => {
    const slides = deckOf("info", "mcq", "mcq");
    expect(slides.map((s) => [s.type, s.order])).toEqual([["info", 0], ["mcq", 1], ["mcq", 2]]);
    expect(slides[1].content).toEqual(defaultSlideContent("mcq"));
  });

  it("inserts at the first, middle and last positions", () => {
    const base = deckOf("info", "info");
    expect(ids(ok(addSlide(base, "mcq", 0, () => "new")).slides)).toEqual(["new", ...ids(base)]);
    expect(ids(ok(addSlide(base, "mcq", 1, () => "new")).slides)).toEqual([base[0].slideId, "new", base[1].slideId]);
    expect(ids(ok(addSlide(base, "mcq", 2, () => "new")).slides).at(-1)).toBe("new");
  });

  it("rejects bad indexes and types without throwing", () => {
    const base = deckOf("info");
    for (const at of [-1, 2, 1.5, Number.NaN]) expect(addSlide(base, "info", at)).toMatchObject({ ok: false, error: { code: "INDEX_OUT_OF_RANGE" } });
    expect(addSlide(base, "video" as never)).toMatchObject({ ok: false, error: { code: "INVALID_SLIDE_TYPE" } });
  });

});

describe("updateSlide", () => {
  it("merges content without touching other slides", () => {
    const base = deckOf("info", "mcq");
    const next = ok(updateSlide(base, base[0].slideId, { markdown: "# Hi" })).slides;
    expect(next[0].content).toEqual({ markdown: "# Hi" });
    expect(next[1]).toEqual(base[1]);
    expect(base[0].content).toEqual({ markdown: "" });
  });

  it("rejects unknown ids", () => {
    expect(updateSlide(deckOf("info"), "nope", { markdown: "x" })).toMatchObject({ ok: false, error: { code: "SLIDE_NOT_FOUND" } });
  });

  it("does not alias patched arrays", () => {
    const base = deckOf("mcq");
    const options = ["a", "b"];
    const next = ok(updateSlide(base, base[0].slideId, { options })).slides;
    options.push("c");
    expect((next[0].content as { options: string[] }).options).toEqual(["a", "b"]);
  });
});

describe("deleteSlide", () => {
  it("removes a slide and renumbers the rest in order", () => {
    const base = deckOf("info", "mcq", "mcq");
    const result = ok(deleteSlide(base, base[1].slideId));
    expect(ids(result.slides)).toEqual([base[0].slideId, base[2].slideId]);
    expect(result.slides.map((s) => s.order)).toEqual([0, 1]);
    expect(result.deleted.slideId).toBe(base[1].slideId);
  });

  it("allows deleting the only slide and rejects unknown IDs", () => {
    const base = deckOf("info");
    expect(ok(deleteSlide(base, base[0].slideId)).slides).toEqual([]);
    expect(deleteSlide(base, "nope")).toMatchObject({ ok: false, error: { code: "SLIDE_NOT_FOUND" } });
    expect(deleteSlide([], "nope")).toMatchObject({ ok: false });
  });
});

describe("duplicateSlide", () => {
  it("inserts a copy with a new ID right after the original", () => {
    const base = deckOf("info", "mcq", "mcq");
    const result = ok(duplicateSlide(base, base[1].slideId, () => "copy"));
    expect(ids(result.slides)).toEqual([base[0].slideId, base[1].slideId, "copy", base[2].slideId]);
    expect(result.slides.map((s) => s.order)).toEqual([0, 1, 2, 3]);
    expect(result.slide.content).toEqual(base[1].content);
  });

  it("deep-copies MCQ options so editing the duplicate leaves the original unchanged", () => {
    let base = deckOf("mcq");
    base = ok(updateSlide(base, base[0].slideId, { text: "Q", options: ["a", "b", "c"], correctOptions: [1] })).slides;
    const dup = ok(duplicateSlide(base, base[0].slideId, () => "copy"));
    const [original, copy] = dup.slides as [PulseSlide & { type: "mcq" }, PulseSlide & { type: "mcq" }];
    expect(copy.content.options).not.toBe(original.content.options);
    expect(copy.content.correctOptions).not.toBe(original.content.correctOptions);

    const edited = ok(removeMcqOption(dup.slides, "copy", 0)).slides as (PulseSlide & { type: "mcq" })[];
    expect(edited[1].content.options).toEqual(["b", "c"]);
    expect(edited[0].content.options).toEqual(["a", "b", "c"]);
    expect(edited[0].content.correctOptions).toEqual([1]);
    const updated = ok(updateSlide(dup.slides, "copy", { text: "Changed" })).slides;
    expect((updated[0].content as { text: string }).text).toBe("Q");
  });

  it("can duplicate twice with distinct IDs", () => {
    const base = deckOf("info");
    const once = ok(duplicateSlide(base, base[0].slideId, seq)).slides;
    const twice = ok(duplicateSlide(once, base[0].slideId, seq)).slides;
    expect(new Set(ids(twice)).size).toBe(3);
    expect(twice.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it("rejects unknown IDs", () => {
    expect(duplicateSlide(deckOf("info"), "nope")).toMatchObject({ ok: false, error: { code: "SLIDE_NOT_FOUND" } });
  });
});

describe("reorderSlides", () => {
  const abcd = () => deckOf("info", "info", "info", "info");

  it("moves forward and back, preserving the relative order of the rest", () => {
    const base = abcd();
    const [a, b, c, d] = ids(base);
    expect(ids(ok(reorderSlides(base, a, 2)).slides)).toEqual([b, c, a, d]);
    expect(ids(ok(reorderSlides(base, d, 1)).slides)).toEqual([a, d, b, c]);
  });

  it("handles first and last positions", () => {
    const base = abcd();
    const [a, b, c, d] = ids(base);
    expect(ids(ok(reorderSlides(base, d, 0)).slides)).toEqual([d, a, b, c]);
    expect(ids(ok(reorderSlides(base, a, 3)).slides)).toEqual([b, c, d, a]);
  });

  it("is a no-op when moved to its own index", () => {
    const base = abcd();
    for (let i = 0; i < 4; i++) expect(ok(reorderSlides(base, base[i].slideId, i)).slides).toEqual(base);
  });

  it("rejects bad indexes and IDs", () => {
    const base = abcd();
    for (const to of [-1, 4, 0.5]) expect(reorderSlides(base, base[0].slideId, to)).toMatchObject({ ok: false, error: { code: "INDEX_OUT_OF_RANGE" } });
    expect(reorderSlides(base, "nope", 0)).toMatchObject({ ok: false, error: { code: "SLIDE_NOT_FOUND" } });
    expect(reorderSlides([], "x", 0)).toMatchObject({ ok: false });
  });
});

describe("normalizeOrder", () => {
  it("renumbers sparse or duplicate orders without reshuffling", () => {
    const messy = [
      { slideId: "c", order: 10, type: "mcq", content: defaultSlideContent("mcq") },
      { slideId: "a", order: 3, type: "info", content: { markdown: "" } },
      { slideId: "b", order: 3, type: "info", content: { markdown: "" } },
    ] as PulseSlide[];
    expect(normalizeOrder(messy).map((s) => [s.slideId, s.order])).toEqual([["a", 0], ["b", 1], ["c", 2]]);
  });
});

describe("MCQ option helpers", () => {
  const mcqDeck = () => {
    const base = deckOf("mcq");
    return ok(updateSlide(base, base[0].slideId, { text: "Q", options: ["a", "b", "c"], correctOptions: [1, 2], multipleAnswers: true })).slides;
  };
  const content = (slides: readonly PulseSlide[]) => slides[0].content as { options: string[]; correctOptions: number[] };

  it("shifts correct indexes when an earlier option is removed", () => {
    const base = mcqDeck();
    const next = ok(removeMcqOption(base, base[0].slideId, 0)).slides;
    expect(content(next)).toMatchObject({ options: ["b", "c"], correctOptions: [0, 1] });
  });

  it("drops a removed correct option and rejects unknown option indexes", () => {
    const base = mcqDeck();
    const id = base[0].slideId;
    const next = ok(removeMcqOption(base, id, 2)).slides;
    expect(content(next)).toMatchObject({ options: ["a", "b"], correctOptions: [1] });
    expect(removeMcqOption(base, id, 9)).toMatchObject({ ok: false, error: { code: "INDEX_OUT_OF_RANGE" } });
  });

  it("sets correct answers for single and multiple modes", () => {
    const base = mcqDeck();
    const id = base[0].slideId;
    expect(content(ok(setMcqOptionCorrect(base, id, 0, true)).slides).correctOptions).toEqual([0, 1, 2]);
    expect(content(ok(setMcqOptionCorrect(base, id, 1, false)).slides).correctOptions).toEqual([2]);
    const single = ok(updateSlide(base, id, { multipleAnswers: false, correctOptions: [1] })).slides;
    expect(content(ok(setMcqOptionCorrect(single, id, 2, true)).slides).correctOptions).toEqual([2]);
  });

  it("rejects non-MCQ slides", () => {
    const base = deckOf("info");
    expect(addMcqOption(base, base[0].slideId)).toMatchObject({ ok: false, error: { code: "WRONG_SLIDE_TYPE" } });
  });
});

describe("many operations", () => {
  it("keeps IDs unique and order contiguous without mutating inputs", () => {
    let slides: PulseSlide[] = deckOf("info", "mcq", "mcq");
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    for (let step = 0; step < 300; step++) {
      freeze(slides);
      const pick = slides.length ? slides[rand(slides.length)].slideId : "none";
      const result = [
        () => addSlide(slides, (["info", "mcq"] as const)[rand(2)], rand(slides.length + 1)),
        () => duplicateSlide(slides, pick),
        () => deleteSlide(slides, pick),
        () => reorderSlides(slides, pick, rand(Math.max(1, slides.length))),
      ][rand(4)]();
      if (result.ok) slides = result.slides;
      expect(new Set(ids(slides)).size).toBe(slides.length);
      expect(slides.map((s) => s.order)).toEqual(slides.map((_, i) => i));
    }
  });
});
