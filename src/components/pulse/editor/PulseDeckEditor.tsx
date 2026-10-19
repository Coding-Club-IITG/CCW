"use client";

import { useEffect, useRef, useState } from "react";

import BackLink from "@/components/shared/BackLink";
import Button from "@/components/shared/Button";
import InlineNotice from "@/components/shared/InlineNotice";
import Modal from "@/components/shared/Modal";
import { isDirty } from "@/lib/pulse/deckEditorStore";
import type { PulseDeckDto } from "@/lib/pulse/deckService";

import PulseSettingsPanel from "./PulseSettingsPanel";
import PulseSlideCanvas from "./PulseSlideCanvas";
import PulseSlideSidebar from "./PulseSlideSidebar";
import { useDeckEditor } from "./useDeckEditor";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";
import styles from "./PulseDeckEditor.module.scss";

type Tab = "slides" | "settings";

interface PulseDeckEditorProps {
  quizId: string;
  initialDeck: PulseDeckDto;
}

/** Field errors for one slide, with the "slides.N." prefix removed. */
function slideFields(fields: Record<string, string[]>, index: number) {
  const prefix = `slides.${index}.`;
  return Object.fromEntries(Object.entries(fields).filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key.slice(prefix.length), value]));
}

export default function PulseDeckEditor({ quizId, initialDeck }: PulseDeckEditorProps) {
  const { store, state, lock, save, tryAcquire, reloadLatest, reloading, dirty } = useDeckEditor(quizId, initialDeck);
  const { actions } = store;
  const [tab, setTab] = useState<Tab>("slides");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ slides: null, settings: null });

  const [discardPrompt, setDiscardPrompt] = useState<"leave" | "reload" | null>(null);
  const leaveResolver = useRef<((leave: boolean) => void) | null>(null);
  const askDiscard = (reason: "leave" | "reload") => new Promise<boolean>((resolve) => {
    if (leaveResolver.current) { resolve(false); return; }
    leaveResolver.current = resolve;
    setDiscardPrompt(reason);
  });
  const answerLeave = (leave: boolean) => {
    setDiscardPrompt(null);
    const resolve = leaveResolver.current;
    leaveResolver.current = null;
    resolve?.(leave);
  };
  useEffect(() => () => {
    leaveResolver.current?.(false);
    leaveResolver.current = null;
  }, []);
  useUnsavedChangesGuard(() => isDirty(store.getState()), () => askDiscard("leave"));

  const confirmReload = async () => {
    if (isDirty(store.getState()) && !(await askDiscard("reload"))) return;
    await reloadLatest();
  };

  const { draft, selectedSlideId, canEdit, save: saveState } = state;
  const selectedIndex = draft.slides.findIndex((slide) => slide.slideId === selectedSlideId);
  const selected = selectedIndex >= 0 ? draft.slides[selectedIndex] : null;

  return (
    <div className={styles.page}>
      <div className={styles.backWrap}>
        <BackLink href={`/pulse/host/${encodeURIComponent(quizId)}`} label="Back to Quiz" />
      </div>

      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Pulse</p>
          <h1 className={styles.title}>Deck Editor</h1>
          {dirty ? <p className={styles.unsaved} aria-live="polite">Unsaved changes</p> : null}
        </div>
        <Button variant="primary" onClick={() => void save()} disabled={!canEdit || !dirty || reloading || saveState.state === "saving"}>
          {saveState.state === "saving" ? "Saving…" : "Save"}
        </Button>
      </header>

      <div className={styles.banners}>
        {lock.phase === "blocked" ? (
          <InlineNotice tone="warning">
            {lock.holder?.name ?? "Another host"} is currently editing this quiz. You can view the deck, but editing is disabled.
          </InlineNotice>
        ) : null}
        {lock.phase === "lost" ? (
          <InlineNotice tone="warning">
            Editor lock released due to inactivity — you may now edit.{" "}
            <Button size="small" onClick={() => void tryAcquire()}>Edit</Button>
          </InlineNotice>
        ) : null}
        {lock.phase === "unavailable" ? (
          <InlineNotice tone="error">
            {lock.message}{" "}
            <Button size="small" onClick={() => void tryAcquire()}>Try again</Button>
          </InlineNotice>
        ) : null}
        {saveState.state === "error" ? (
          <InlineNotice tone="error">
            {saveState.message}
            {saveState.code === "CONFLICT" ? (
              <>
                {" "}
                <Button size="small" onClick={() => void confirmReload()} disabled={reloading}>
                  {reloading ? "Reloading…" : "Reload latest"}
                </Button>
              </>
            ) : null}
            {Object.entries(saveState.fields).length ? (
              <ul>
                {Object.entries(saveState.fields).flatMap(([key, messages]) => messages.map((message) => (
                  <li key={`${key}:${message}`}>{/^slides\.(\d+)\./.test(key) ? `Slide ${Number(key.split(".")[1]) + 1}: ` : ""}{message}</li>
                )))}
              </ul>
            ) : null}
          </InlineNotice>
        ) : null}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Editor sections">
        {([["slides", "Slides"], ["settings", "Quiz settings"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
            ref={(element) => { tabRefs.current[id] = element; }} tabIndex={tab === id ? 0 : -1}
            className={`${styles.tab} ${tab === id ? styles.tabActive : ""}`} onClick={() => setTab(id)}
            onKeyDown={(event) => {
              let next: Tab;
              switch (event.key) {
                case "ArrowLeft":
                case "ArrowRight": next = id === "slides" ? "settings" : "slides"; break;
                case "Home": next = "slides"; break;
                case "End": next = "settings"; break;
                default: return;
              }
              event.preventDefault();
              setTab(next);
              tabRefs.current[next]?.focus();
            }}>
            {label}
          </button>
        ))}
      </div>

      <div hidden={tab !== "slides"} role="tabpanel" id="panel-slides" aria-labelledby="tab-slides" tabIndex={0}>
        {tab === "slides" ? (
          <div className={styles.workspace}>
            <PulseSlideSidebar
              slides={draft.slides}
              selectedSlideId={selectedSlideId}
              readOnly={!canEdit || reloading}
              onSelect={actions.select}
              onAdd={(type) => actions.addSlide(type)}
              onDuplicate={actions.duplicateSlide}
              onDelete={actions.deleteSlide}
              onMove={actions.reorderSlide}
            />
            <PulseSlideCanvas
              slide={selected}
              index={selectedIndex}
              readOnly={!canEdit || reloading}
              timerEnabled={draft.delivery.mode === "host-paced" && draft.settings.timer.perQuestionEnabled}
              errors={selectedIndex >= 0 && saveState.state === "error" ? slideFields(saveState.fields, selectedIndex) : {}}
              onChange={actions.updateSlide}
              onAddOption={(slideId) => actions.addMcqOption(slideId)}
              onRemoveOption={actions.removeMcqOption}
              onSetCorrect={actions.setMcqOptionCorrect}
            />
          </div>
        ) : null}
      </div>
      <section hidden={tab !== "settings"} role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" tabIndex={0}>
        {tab === "settings" ? (
          <PulseSettingsPanel
            delivery={draft.delivery}
            registration={draft.registration}
            settings={draft.settings}
            slides={draft.slides}
            readOnly={!canEdit || reloading}
            errors={saveState.state === "error" ? saveState.fields : {}}
            onChange={actions.updateConfig}
          />
        ) : null}
      </section>

      {discardPrompt ? (
        <Modal
          kicker="Unsaved changes"
          title={discardPrompt === "reload" ? "Reload saved deck?" : "Navigate away?"}
          description={discardPrompt === "reload" ? "Your unsaved changes will be replaced by the saved deck." : "Changes have not been saved."}
          onClose={() => answerLeave(false)}
          maxWidth={480}
          footer={
            <>
              <Button variant="ghost" onClick={() => answerLeave(false)}>{discardPrompt === "reload" ? "Keep editing" : "Stay"}</Button>
              <Button variant="danger" onClick={() => answerLeave(true)}>{discardPrompt === "reload" ? "Reload latest" : "Leave"}</Button>
            </>
          }
        >
          <p>{discardPrompt === "reload" ? "Reload only if you want to discard this draft." : "Leaving discards your unsaved edits to this deck."}</p>
        </Modal>
      ) : null}
    </div>
  );
}
