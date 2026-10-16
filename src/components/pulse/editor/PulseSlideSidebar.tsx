"use client";

import { ChevronDown, ChevronUp, Copy, Plus, Trash2 } from "lucide-react";

import { PULSE_SLIDE_TYPES, type PulseSlideType } from "@/lib/pulse/constants";
import type { PulseSlide } from "@/lib/pulse/deckSchemas";

import styles from "./PulseSlideSidebar.module.scss";

export const SLIDE_TYPE_LABELS: Record<PulseSlideType, string> = { info: "Info", mcq: "MCQ", qa: "Q&A" };

interface PulseSlideSidebarProps {
  slides: PulseSlide[];
  selectedSlideId: string | null;
  readOnly: boolean;
  onSelect: (slideId: string) => void;
  onAdd: (type: PulseSlideType) => void;
  onDuplicate: (slideId: string) => void;
  onDelete: (slideId: string) => void;
  onMove: (slideId: string, toIndex: number) => void;
}

export default function PulseSlideSidebar({
  slides, selectedSlideId, readOnly, onSelect, onAdd, onDuplicate, onDelete, onMove,
}: PulseSlideSidebarProps) {
  return (
    <aside className={styles.sidebar} aria-label="Slides">
      <h2 className={styles.heading}>Slides</h2>

      {slides.length === 0 ? (
        <p className={styles.empty}>No slides yet. Add an Info, MCQ or Q&amp;A slide to begin.</p>
      ) : (
        <ol className={styles.list}>
          {slides.map((slide, index) => {
            const selected = slide.slideId === selectedSlideId;
            return (
              <li key={slide.slideId} className={`${styles.row} ${selected ? styles.selected : ""}`}>
                <button type="button" className={styles.select} aria-current={selected ? "true" : undefined} onClick={() => onSelect(slide.slideId)}>
                  <span className={styles.index}>{index + 1}</span>
                  <span className={`${styles.badge} ${styles[slide.type]}`}>{SLIDE_TYPE_LABELS[slide.type]}</span>
                </button>
                {!readOnly ? (
                  <span className={styles.actions}>
                    <button type="button" className={styles.iconButton} aria-label={`Move slide ${index + 1} up`} disabled={index === 0} onClick={() => onMove(slide.slideId, index - 1)}><ChevronUp size={14} /></button>
                    <button type="button" className={styles.iconButton} aria-label={`Move slide ${index + 1} down`} disabled={index === slides.length - 1} onClick={() => onMove(slide.slideId, index + 1)}><ChevronDown size={14} /></button>
                    <button type="button" className={styles.iconButton} aria-label={`Duplicate slide ${index + 1}`} onClick={() => onDuplicate(slide.slideId)}><Copy size={14} /></button>
                    <button type="button" className={`${styles.iconButton} ${styles.danger}`} aria-label={`Delete slide ${index + 1}`} onClick={() => onDelete(slide.slideId)}><Trash2 size={14} /></button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {!readOnly ? (
        <div className={styles.add}>
          <span className={styles.addLabel}>Add slide</span>
          <div className={styles.addButtons}>
            {PULSE_SLIDE_TYPES.map((type) => (
              <button key={type} type="button" className={styles.addButton} onClick={() => onAdd(type)}>
                <Plus size={12} aria-hidden="true" />
                {SLIDE_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
