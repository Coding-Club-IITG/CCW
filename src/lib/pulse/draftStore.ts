/**
 * Core draft-state management engine for Pulse slides.
 * Enforces content preservation across slide type transitions through
 * a dedicated multi-type draft cache.
 */

import { getDefaultContentForType } from "./constants";
import type {
  InfoSlideContent,
  MCQOption,
  MCQSlideContent,
  PacingMode,
  PulseDraftCache,
  PulseSlide,
  PulseSlideDraft,
  QASlideContent,
  SlideContent,
  SlideType,
} from "./types";
import { validateSlide } from "./validation";

/**
 * Creates a fresh draft container initialized with a slide or sensible defaults.
 */
export function createSlideDraft(
  initial?: Partial<PulseSlide>,
  pacingMode: PacingMode = "host-paced",
): PulseSlideDraft {
  const slideId = initial?.id ?? `slide-${Date.now()}`;
  const activeType: SlideType = initial?.type ?? "info";

  const initialContent: SlideContent =
    initial?.content ?? getDefaultContentForType(activeType);

  const cachedByType: PulseDraftCache = {
    [activeType]: initialContent,
  };

  const validation = validateSlide(activeType, initialContent, pacingMode);

  return {
    slideId,
    activeType,
    content: initialContent,
    pacingMode,
    cachedByType,
    isDirty: false,
    touchedFields: {},
    validationErrors: validation.errors,
    lastSavedAt: initial?.updatedAt,
  };
}

/**
 * Migrates common text fields (prompt, title, markdown) across types
 * when no prior cached version exists for the target type.
 */
function deriveDefaultContentWithMigration(
  currentContent: SlideContent,
  targetType: SlideType,
): SlideContent {
  const defaults = getDefaultContentForType(targetType);

  // Extract any existing prompt or title
  let extractedTitle = "";
  if (currentContent.type === "info") {
    extractedTitle = currentContent.title || "";
    if (!extractedTitle && currentContent.markdown) {
      const headingMatch = currentContent.markdown.match(/^#\s+(.+)$/m);
      if (headingMatch) extractedTitle = headingMatch[1].trim();
    }
  } else if (currentContent.type === "mcq") {
    extractedTitle = currentContent.prompt || "";
  } else if (currentContent.type === "qa") {
    extractedTitle = currentContent.prompt || "";
  }

  if (targetType === "info") {
    const infoDefaults = defaults as InfoSlideContent;
    return {
      ...infoDefaults,
      title: extractedTitle || infoDefaults.title,
      markdown: extractedTitle
        ? `# ${extractedTitle}\n\nEnter content here.`
        : infoDefaults.markdown,
    };
  }

  if (targetType === "mcq") {
    const mcqDefaults = defaults as MCQSlideContent;
    return {
      ...mcqDefaults,
      prompt: extractedTitle || mcqDefaults.prompt,
    };
  }

  if (targetType === "qa") {
    const qaDefaults = defaults as QASlideContent;
    return {
      ...qaDefaults,
      prompt: extractedTitle || qaDefaults.prompt,
    };
  }

  return defaults;
}

/**
 * Switches the slide type safely without silently destroying existing content.
 * Retains active content in `cachedByType` so switching back restores everything intact.
 */
export function switchSlideType(
  draft: PulseSlideDraft,
  targetType: SlideType,
): PulseSlideDraft {
  if (draft.activeType === targetType) {
    return draft;
  }

  // 1. Cache current content before leaving current type
  const updatedCache: PulseDraftCache = {
    ...draft.cachedByType,
    [draft.activeType]: draft.content,
  };

  // 2. Retrieve existing cached content for targetType or derive non-destructive default
  let nextContent: SlideContent;
  if (updatedCache[targetType]) {
    // Restore preserved draft
    nextContent = updatedCache[targetType]!;
  } else {
    // Derive fresh default preserving applicable prompt/title
    nextContent = deriveDefaultContentWithMigration(draft.content, targetType);
    updatedCache[targetType] = nextContent;
  }

  // 3. Re-run validation for the new type
  const validation = validateSlide(targetType, nextContent, draft.pacingMode);

  return {
    ...draft,
    activeType: targetType,
    content: nextContent,
    cachedByType: updatedCache,
    isDirty: true,
    validationErrors: validation.errors,
  };
}

/**
 * Updates slide content immutably, syncing the type-specific cache
 * and updating live validation errors.
 */
export function updateDraftContent(
  draft: PulseSlideDraft,
  updater: (prev: SlideContent) => SlideContent,
): PulseSlideDraft {
  const nextContent = updater(draft.content);

  const updatedCache: PulseDraftCache = {
    ...draft.cachedByType,
    [draft.activeType]: nextContent,
  };

  const validation = validateSlide(
    draft.activeType,
    nextContent,
    draft.pacingMode,
  );

  return {
    ...draft,
    content: nextContent,
    cachedByType: updatedCache,
    isDirty: true,
    validationErrors: validation.errors,
  };
}

/**
 * Updates pacing mode and re-validates host-paced dependent settings (e.g. per-question timer).
 */
export function updateDraftPacingMode(
  draft: PulseSlideDraft,
  pacingMode: PacingMode,
): PulseSlideDraft {
  const validation = validateSlide(
    draft.activeType,
    draft.content,
    pacingMode,
  );

  return {
    ...draft,
    pacingMode,
    isDirty: true,
    validationErrors: validation.errors,
  };
}

/**
 * Marks a field as touched for focused validation display.
 */
export function markDraftFieldTouched(
  draft: PulseSlideDraft,
  field: string,
): PulseSlideDraft {
  if (draft.touchedFields[field]) return draft;
  return {
    ...draft,
    touchedFields: {
      ...draft.touchedFields,
      [field]: true,
    },
  };
}

/**
 * Helper to update an MCQ option by index.
 */
export function updateMCQOptionInDraft(
  draft: PulseSlideDraft,
  index: number,
  patch: Partial<MCQOption>,
): PulseSlideDraft {
  if (draft.content.type !== "mcq") return draft;

  return updateDraftContent(draft, (prev) => {
    const mcq = prev as MCQSlideContent;
    const options = [...mcq.options];
    if (index < 0 || index >= options.length) return mcq;

    // Handle single-answer radio behavior: if isCorrect is set to true on one option,
    // and allowMultipleAnswers is false, uncheck other options
    if (patch.isCorrect === true && !mcq.allowMultipleAnswers) {
      options.forEach((opt, idx) => {
        options[idx] = { ...opt, isCorrect: idx === index };
      });
    } else {
      options[index] = { ...options[index], ...patch };
    }

    return {
      ...mcq,
      options,
    };
  });
}

/**
 * Helper to add an MCQ option.
 */
export function addMCQOptionToDraft(
  draft: PulseSlideDraft,
  text = "",
): PulseSlideDraft {
  if (draft.content.type !== "mcq") return draft;

  return updateDraftContent(draft, (prev) => {
    const mcq = prev as MCQSlideContent;
    const newId = `opt-${Date.now()}-${mcq.options.length + 1}`;
    const newOption: MCQOption = {
      id: newId,
      text,
      isCorrect: false,
    };
    return {
      ...mcq,
      options: [...mcq.options, newOption],
    };
  });
}

/**
 * Helper to remove an MCQ option.
 */
export function removeMCQOptionFromDraft(
  draft: PulseSlideDraft,
  index: number,
): PulseSlideDraft {
  if (draft.content.type !== "mcq") return draft;

  return updateDraftContent(draft, (prev) => {
    const mcq = prev as MCQSlideContent;
    if (mcq.options.length <= 1) return mcq;
    const options = mcq.options.filter((_, idx) => idx !== index);
    return {
      ...mcq,
      options,
    };
  });
}

/**
 * Helper to reorder MCQ options.
 */
export function reorderMCQOptionsInDraft(
  draft: PulseSlideDraft,
  fromIndex: number,
  toIndex: number,
): PulseSlideDraft {
  if (draft.content.type !== "mcq") return draft;

  return updateDraftContent(draft, (prev) => {
    const mcq = prev as MCQSlideContent;
    if (
      fromIndex < 0 ||
      fromIndex >= mcq.options.length ||
      toIndex < 0 ||
      toIndex >= mcq.options.length
    ) {
      return mcq;
    }
    const options = [...mcq.options];
    const [moved] = options.splice(fromIndex, 1);
    options.splice(toIndex, 0, moved);
    return {
      ...mcq,
      options,
    };
  });
}

/**
 * Checks if draft has preserved content cached for a given type.
 */
export function hasCachedDraftContent(
  draft: PulseSlideDraft,
  type: SlideType,
): boolean {
  return Boolean(draft.cachedByType[type]);
}

/**
 * Commits the active draft, returning validated PulseSlide or errors.
 */
export function commitSlideDraft(
  draft: PulseSlideDraft,
): { ok: true; slide: PulseSlide } | { ok: false; errors: Record<string, string> } {
  const validation = validateSlide(
    draft.activeType,
    draft.content,
    draft.pacingMode,
  );

  if (!validation.isValid) {
    return {
      ok: false,
      errors: validation.errors,
    };
  }

  const slide: PulseSlide = {
    id: draft.slideId,
    type: draft.activeType,
    content: draft.content,
    updatedAt: new Date().toISOString(),
  };

  return {
    ok: true,
    slide,
  };
}
