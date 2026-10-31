"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  addMCQOptionToDraft,
  commitSlideDraft,
  createSlideDraft,
  hasCachedDraftContent,
  markDraftFieldTouched,
  removeMCQOptionFromDraft,
  reorderMCQOptionsInDraft,
  switchSlideType,
  updateDraftContent,
  updateDraftPacingMode,
  updateMCQOptionInDraft,
} from "./draftStore";
import type {
  MCQOption,
  PacingMode,
  PulseSlide,
  PulseSlideDraft,
  SlideContent,
  SlideType,
} from "./types";

interface SlideDraftContextValue {
  draft: PulseSlideDraft;
  activeType: SlideType;
  content: SlideContent;
  pacingMode: PacingMode;
  errors: Record<string, string>;
  isDirty: boolean;
  switchType: (newType: SlideType) => void;
  updateContent: (updater: (prev: SlideContent) => SlideContent) => void;
  updateField: (field: string, value: unknown) => void;
  setPacingMode: (mode: PacingMode) => void;
  setMCQOption: (index: number, patch: Partial<MCQOption>) => void;
  addMCQOption: (text?: string) => void;
  removeMCQOption: (index: number) => void;
  reorderMCQOptions: (fromIndex: number, toIndex: number) => void;
  markTouched: (field: string) => void;
  hasCachedContent: (type: SlideType) => boolean;
  commit: () => { ok: boolean; slide?: PulseSlide; errors?: Record<string, string> };
  reset: () => void;
}

const SlideDraftContext = createContext<SlideDraftContextValue | null>(null);

export interface SlideDraftProviderProps {
  initialSlide?: Partial<PulseSlide>;
  initialPacingMode?: PacingMode;
  children: React.ReactNode;
}

export function SlideDraftProvider({
  initialSlide,
  initialPacingMode = "host-paced",
  children,
}: SlideDraftProviderProps) {
  const [draft, setDraft] = useState<PulseSlideDraft>(() =>
    createSlideDraft(initialSlide, initialPacingMode),
  );

  const switchType = useCallback((newType: SlideType) => {
    setDraft((prev) => switchSlideType(prev, newType));
  }, []);

  const updateContent = useCallback(
    (updater: (prev: SlideContent) => SlideContent) => {
      setDraft((prev) => updateDraftContent(prev, updater));
    },
    [],
  );

  const updateField = useCallback((field: string, value: unknown) => {
    setDraft((prev) =>
      updateDraftContent(prev, (content) => ({
        ...content,
        [field]: value,
      })),
    );
  }, []);

  const setPacingMode = useCallback((mode: PacingMode) => {
    setDraft((prev) => updateDraftPacingMode(prev, mode));
  }, []);

  const setMCQOption = useCallback(
    (index: number, patch: Partial<MCQOption>) => {
      setDraft((prev) => updateMCQOptionInDraft(prev, index, patch));
    },
    [],
  );

  const addMCQOption = useCallback((text = "") => {
    setDraft((prev) => addMCQOptionToDraft(prev, text));
  }, []);

  const removeMCQOption = useCallback((index: number) => {
    setDraft((prev) => removeMCQOptionFromDraft(prev, index));
  }, []);

  const reorderMCQOptions = useCallback(
    (fromIndex: number, toIndex: number) => {
      setDraft((prev) =>
        reorderMCQOptionsInDraft(prev, fromIndex, toIndex),
      );
    },
    [],
  );

  const markTouched = useCallback((field: string) => {
    setDraft((prev) => markDraftFieldTouched(prev, field));
  }, []);

  const hasCachedContent = useCallback(
    (type: SlideType) => hasCachedDraftContent(draft, type),
    [draft],
  );

  const commit = useCallback(() => {
    const result = commitSlideDraft(draft);
    if (result.ok) {
      setDraft((prev) => ({
        ...prev,
        isDirty: false,
        lastSavedAt: result.slide.updatedAt,
      }));
    }
    return result;
  }, [draft]);

  const reset = useCallback(() => {
    setDraft(createSlideDraft(initialSlide, initialPacingMode));
  }, [initialSlide, initialPacingMode]);

  const value = useMemo<SlideDraftContextValue>(
    () => ({
      draft,
      activeType: draft.activeType,
      content: draft.content,
      pacingMode: draft.pacingMode,
      errors: draft.validationErrors,
      isDirty: draft.isDirty,
      switchType,
      updateContent,
      updateField,
      setPacingMode,
      setMCQOption,
      addMCQOption,
      removeMCQOption,
      reorderMCQOptions,
      markTouched,
      hasCachedContent,
      commit,
      reset,
    }),
    [
      draft,
      switchType,
      updateContent,
      updateField,
      setPacingMode,
      setMCQOption,
      addMCQOption,
      removeMCQOption,
      reorderMCQOptions,
      markTouched,
      hasCachedContent,
      commit,
      reset,
    ],
  );

  return (
    <SlideDraftContext.Provider value={value}>
      {children}
    </SlideDraftContext.Provider>
  );
}

export function useSlideDraft(): SlideDraftContextValue {
  const context = useContext(SlideDraftContext);
  if (!context) {
    throw new Error("useSlideDraft must be used within a SlideDraftProvider");
  }
  return context;
}
