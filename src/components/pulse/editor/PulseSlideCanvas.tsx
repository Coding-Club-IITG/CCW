"use client";

import { Plus, Trash2 } from "lucide-react";

import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import Button from "@/components/shared/Button";
import MarkdownEditor from "@/components/shared/MarkdownEditor";
import type { PulseSlide } from "@/lib/pulse/deckSchemas";

import styles from "./PulseSlideCanvas.module.scss";

type McqSlide = Extract<PulseSlide, { type: "mcq" }>;

interface PulseSlideCanvasProps {
  slide: PulseSlide | null;
  index: number;
  readOnly: boolean;
  /** Per-question timers are only meaningful in host-paced mode with them enabled. */
  timerEnabled: boolean;
  /** The server's field errors for this slide, keyed like "content.text". */
  errors: Record<string, string[]>;
  onChange: (slideId: string, patch: Partial<PulseSlide["content"]>) => void;
  onAddOption: (slideId: string) => void;
  onRemoveOption: (slideId: string, optionIndex: number) => void;
  onSetCorrect: (slideId: string, optionIndex: number, correct: boolean) => void;
}

function FieldErrors({ errors, name }: { errors: Record<string, string[]>; name: string }) {
  const messages = Object.entries(errors).filter(([key]) => key === name || key.startsWith(`${name}.`)).flatMap(([, value]) => value);
  return messages.length ? <p className={styles.error} role="alert">{messages.join(" ")}</p> : null;
}

export default function PulseSlideCanvas({
  slide, index, readOnly, timerEnabled, errors, onChange, onAddOption, onRemoveOption, onSetCorrect,
}: PulseSlideCanvasProps) {
  if (!slide) {
    return (
      <section className={styles.canvas} aria-label="Slide canvas">
        <p className={styles.empty}>Select a slide, or add one, to start editing.</p>
      </section>
    );
  }
  const id = slide.slideId;

  return (
    <section className={styles.canvas} aria-label={`Slide ${index + 1} canvas`}>
      <h2 className={styles.title}>Slide {index + 1}</h2>

      {slide.type === "info" ? (
        <div className={styles.field}>
          <label htmlFor={`markdown-${id}`}>Content (Markdown)</label>
          {readOnly ? (
            <MarkdownRenderer content={slide.content.markdown} />
          ) : (
            <MarkdownEditor id={`markdown-${id}`} value={slide.content.markdown} onChange={(markdown) => onChange(id, { markdown })} rows={12} />
          )}
          <FieldErrors errors={errors} name="content.markdown" />
        </div>
      ) : slide.type === "mcq" ? (
        <McqFields slide={slide} readOnly={readOnly} timerEnabled={timerEnabled} errors={errors}
          onChange={onChange} onAddOption={onAddOption} onRemoveOption={onRemoveOption} onSetCorrect={onSetCorrect} />
      ) : (
        <fieldset className={styles.checks} disabled={readOnly}>
          <legend>Audience Q&amp;A</legend>
          {([
            ["anonymous", "Allow anonymous submissions"],
            ["publicQuestions", "Make questions visible to everyone"],
            ["allowUpvotes", "Allow upvotes"],
          ] as const).map(([key, label]) => (
            <label key={key} className={styles.check}>
              <input type="checkbox" checked={slide.content[key]} onChange={(event) => onChange(id, { [key]: event.target.checked })} />
              {label}
            </label>
          ))}
          <FieldErrors errors={errors} name="content" />
        </fieldset>
      )}
    </section>
  );
}

function McqFields({ slide, readOnly, timerEnabled, errors, onChange, onAddOption, onRemoveOption, onSetCorrect }:
  Omit<PulseSlideCanvasProps, "slide" | "index"> & { slide: McqSlide }) {
  const { content, slideId: id } = slide;
  const numberOrNull = (value: string) => (value === "" ? null : Number(value));

  return (
    <>
      <div className={styles.field}>
        <label htmlFor={`text-${id}`}>Question</label>
        <textarea id={`text-${id}`} rows={3} value={content.text} readOnly={readOnly}
          onChange={(event) => onChange(id, { text: event.target.value })} />
        <FieldErrors errors={errors} name="content.text" />
      </div>

      <fieldset className={styles.options} disabled={readOnly}>
        <legend>Options — mark the correct answer</legend>
        {content.options.map((option, i) => (
          <div key={i} className={styles.optionRow}>
            <input
              type={content.multipleAnswers ? "checkbox" : "radio"}
              name={`correct-${id}`}
              aria-label={`Option ${i + 1} is correct`}
              checked={content.correctOptions.includes(i)}
              onChange={(event) => onSetCorrect(id, i, event.target.checked)}
            />
            <input type="text" aria-label={`Option ${i + 1}`} value={option}
              onChange={(event) => onChange(id, { options: content.options.map((o, j) => (j === i ? event.target.value : o)) })} />
            <button type="button" className={styles.iconButton} aria-label={`Remove option ${i + 1}`} onClick={() => onRemoveOption(id, i)}>
              <Trash2 size={14} />
            </button>
            <FieldErrors errors={errors} name={`content.options.${i}`} />
          </div>
        ))}
        <FieldErrors errors={errors} name="content.options" />
        <FieldErrors errors={errors} name="content.correctOptions" />
        <Button size="small" onClick={() => onAddOption(id)}><Plus size={12} aria-hidden="true" /> Add option</Button>
      </fieldset>

      <fieldset className={styles.checks} disabled={readOnly}>
        <legend>Question settings</legend>
        <label className={styles.check}>
          <input type="checkbox" checked={content.multipleAnswers}
            onChange={(event) => onChange(id, { multipleAnswers: event.target.checked })} />
          Allow multiple answers
        </label>
        <label className={styles.check}>
          <input type="checkbox" checked={content.poll}
            onChange={(event) => onChange(id, { poll: event.target.checked })} />
          Poll (no correct answer, not scored)
        </label>
        <div className={styles.field}>
          <label htmlFor={`points-${id}`}>Points</label>
          <input id={`points-${id}`} type="number" min={1} step={1} value={content.points} disabled={content.poll}
            onChange={(event) => onChange(id, { points: Number(event.target.value) })} />
          <FieldErrors errors={errors} name="content.points" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`timer-${id}`}>Timer (seconds)</label>
          <input id={`timer-${id}`} type="number" min={1} step={1} value={content.timerSeconds ?? ""} disabled={!timerEnabled && content.timerSeconds === null}
            onChange={(event) => onChange(id, { timerSeconds: numberOrNull(event.target.value) })} />
          {timerEnabled ? null : <p className={styles.hint}>Per-question timers need host-paced delivery with per-question timers turned on.</p>}
          <FieldErrors errors={errors} name="content.timerSeconds" />
        </div>
      </fieldset>
    </>
  );
}
