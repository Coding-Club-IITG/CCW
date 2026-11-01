"use client";

import type { ReactNode } from "react";

import {
  PULSE_DECK_LIMITS,
  PULSE_DELIVERY_MODES,
} from "@/lib/pulse/constants";
import type { PulseDelivery, PulseRegistration, PulseSettings, PulseSlide } from "@/lib/pulse/deckSchemas";

import styles from "./PulseSettingsPanel.module.scss";

interface PulseSettingsPanelProps {
  delivery: PulseDelivery;
  registration: PulseRegistration;
  settings: PulseSettings;
  slides: PulseSlide[];
  readOnly: boolean;
  /** The server's field errors, keyed like "delivery.navigation". */
  errors: Record<string, string[]>;
  onChange: (patch: { delivery?: PulseDelivery; registration?: PulseRegistration; settings?: PulseSettings }) => void;
}

const MODE_LABELS: Record<(typeof PULSE_DELIVERY_MODES)[number], string> = {
  "host-paced": "Host-paced",
  "participant-paced": "Participant-paced",
};

// The design-doc rules behind each option that a delivery mode rules out.
const FREE_NAVIGATION_RULE = "Free navigation needs participant-paced delivery; host-paced navigation is sequential.";
const ANSWER_CONTROLLER_RULE = "The answer controller is a host-paced option.";
const PER_QUESTION_TIMER_RULE = "Per-question timers are only supported in host-paced mode; only the overall timer applies.";
const TIME_BASED_RULE = "Time-based scoring needs a deadline: per-question timers when host-paced, the overall timer when participant-paced.";
const ANSWER_EDIT_RULE = "Sequential participant-paced quizzes can't revisit earlier slides, so answers can't be edited.";
const RANDOMIZE_QUESTIONS_RULE = "Per-participant question order needs participant-paced delivery.";
const RANDOMIZE_OPTIONS_RULE = "Randomized options can't be used with the answer controller; devices wouldn't match the shared screen.";
const GUESTS_RULE = "Guest participation isn't available yet.";

function Field({ label, htmlFor, hint, errors, name, children }: {
  label: string; htmlFor?: string; hint?: string; errors: Record<string, string[]>; name: string; children: ReactNode;
}) {
  const messages = Object.entries(errors).filter(([key]) => key === name || key.startsWith(`${name}.`)).flatMap(([, value]) => value);
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {messages.length ? <p className={styles.error} role="alert">{messages.join(" ")}</p> : null}
    </div>
  );
}

function Check({ label, checked, disabled, hint, errors, name, onChange }: {
  label: string; checked: boolean; disabled?: boolean; hint?: string; errors: Record<string, string[]>; name: string; onChange: (checked: boolean) => void;
}) {
  const messages = Object.entries(errors).filter(([key]) => key === name).flatMap(([, value]) => value);
  return (
    <div className={styles.check}>
      <label>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      {messages.length ? <p className={styles.error} role="alert">{messages.join(" ")}</p> : null}
    </div>
  );
}

export default function PulseSettingsPanel({ delivery, registration, settings, slides, readOnly, errors, onChange }: PulseSettingsPanelProps) {
  const hostPaced = delivery.mode === "host-paced";
  const { timer, scoring, answers, reveal, randomization, leaderboard } = settings;
  const setDelivery = (patch: Partial<PulseDelivery>) => onChange({ delivery: { ...delivery, ...patch } });
  const setRegistration = (patch: Partial<PulseRegistration>) => onChange({ registration: { ...registration, ...patch } });
  const setSettings = <K extends keyof PulseSettings>(section: K, patch: Partial<PulseSettings[K]>) =>
    onChange({ settings: { ...settings, [section]: { ...settings[section], ...patch } } });

  // Each mirrors a rule in checkConfig(): the panel disables what the server would reject.
  const timeBasedAvailable = hostPaced ? timer.perQuestionEnabled : timer.overallEnabled;
  const canEditAnswers = hostPaced || delivery.navigation === "free";
  const canRandomizeQuestions = !hostPaced;
  const canRandomizeOptions = delivery.displayMode !== "answer-controller";

  const mcqSlides = slides.map((slide, index) => ({ slide, index })).filter(({ slide }) => slide.type === "mcq");
  const known = new Set(slides.map((slide) => slide.slideId));
  const stale = leaderboard.showAfterQuestions.filter((id) => !known.has(id));
  const toggleLeaderboardSlide = (slideId: string, on: boolean) =>
    setSettings("leaderboard", {
      showAfterQuestions: on ? [...leaderboard.showAfterQuestions, slideId] : leaderboard.showAfterQuestions.filter((id) => id !== slideId),
    });

  return (
    <div className={styles.panel}>
      <fieldset className={styles.section} disabled={readOnly}>
        <legend>Delivery</legend>
        <Field label="Delivery mode" htmlFor="delivery-mode" errors={errors} name="delivery.mode">
          <select id="delivery-mode" value={delivery.mode} onChange={(event) => setDelivery({ mode: event.target.value as PulseDelivery["mode"] })}>
            {PULSE_DELIVERY_MODES.map((mode) => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
          </select>
        </Field>
        <Field label="Navigation" htmlFor="delivery-navigation" errors={errors} name="delivery.navigation"
          hint={hostPaced ? FREE_NAVIGATION_RULE : "Free lets participants visit any slide; sequential moves forward only."}>
          <select id="delivery-navigation" value={delivery.navigation} onChange={(event) => setDelivery({ navigation: event.target.value as PulseDelivery["navigation"] })}>
            <option value="sequential">Sequential</option>
            <option value="free" disabled={hostPaced} title={hostPaced ? FREE_NAVIGATION_RULE : undefined}>Free</option>
          </select>
        </Field>
        <Field label="Display mode" htmlFor="delivery-display" errors={errors} name="delivery.displayMode"
          hint={hostPaced ? undefined : ANSWER_CONTROLLER_RULE}>
          <select id="delivery-display" value={delivery.displayMode} onChange={(event) => setDelivery({ displayMode: event.target.value as PulseDelivery["displayMode"] })}>
            <option value="full-prompt">Full prompt</option>
            <option value="answer-controller" disabled={!hostPaced} title={hostPaced ? undefined : ANSWER_CONTROLLER_RULE}>Answer controller</option>
          </select>
        </Field>
      </fieldset>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>Registration</legend>
        <Check label="Allow IITG accounts" checked={registration.allowIITGAccounts} errors={errors} name="registration.allowIITGAccounts"
          onChange={(allowIITGAccounts) => setRegistration({ allowIITGAccounts })} />
        <Check label="Allow guests" checked={registration.allowGuests} disabled hint={GUESTS_RULE}
          errors={errors} name="registration.allowGuests"
          onChange={(allowGuests) => setRegistration({ allowGuests })} />
        <Field label="Maximum participants" htmlFor="registration-max" errors={errors} name="registration.maxParticipants">
          <input id="registration-max" type="number" min={1} max={PULSE_DECK_LIMITS.maxParticipants} step={1} value={registration.maxParticipants}
            onChange={(event) => setRegistration({ maxParticipants: Number(event.target.value) })} />
        </Field>
        <Check label="Allow late join" checked={registration.allowLateJoin} errors={errors} name="registration.allowLateJoin"
          onChange={(allowLateJoin) => setRegistration({ allowLateJoin })} />
      </fieldset>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>Timers</legend>
        <Check label="Overall quiz timer" checked={timer.overallEnabled} errors={errors} name="settings.timer.overallEnabled"
          onChange={(overallEnabled) => setSettings("timer", { overallEnabled })} />
        <Field label="Overall duration (seconds)" htmlFor="timer-overall" errors={errors} name="settings.timer.overallDurationSeconds">
          <input id="timer-overall" type="number" min={1} step={1} value={timer.overallDurationSeconds} disabled={!timer.overallEnabled}
            onChange={(event) => setSettings("timer", { overallDurationSeconds: Number(event.target.value) })} />
        </Field>
        <Check label="Per-question timers" checked={timer.perQuestionEnabled} disabled={!hostPaced && !timer.perQuestionEnabled}
          errors={errors} name="settings.timer.perQuestionEnabled"
          hint={hostPaced ? undefined : PER_QUESTION_TIMER_RULE}
          onChange={(perQuestionEnabled) => setSettings("timer", { perQuestionEnabled })} />
        <Field label="Default question timer (seconds)" htmlFor="timer-default-question" errors={errors}
          name="settings.timer.defaultQuestionSeconds"
          hint="Stamped onto new questions. Each slide can override it.">
          <input id="timer-default-question" type="number" min={PULSE_DECK_LIMITS.minQuestionSeconds} step={1}
            value={timer.defaultQuestionSeconds ?? ""} disabled={!timer.perQuestionEnabled}
            onChange={(event) => setSettings("timer", {
              defaultQuestionSeconds: event.target.value === "" ? null : Number(event.target.value),
            })} />
        </Field>
      </fieldset>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>Scoring</legend>
        <Field label="Scoring mode" htmlFor="scoring-mode" errors={errors} name="settings.scoring.mode"
          hint={timeBasedAvailable ? "Time-based awards full points instantly, falling to 50% at the deadline." : TIME_BASED_RULE}>
          <select id="scoring-mode" value={scoring.mode}
            onChange={(event) => setSettings("scoring", { mode: event.target.value as PulseSettings["scoring"]["mode"] })}>
            <option value="full">Full points</option>
            <option value="time_based" disabled={!timeBasedAvailable} title={timeBasedAvailable ? undefined : TIME_BASED_RULE}>
              Time-based
            </option>
          </select>
        </Field>
        <Field label="Default points for new questions" htmlFor="scoring-default-points" errors={errors}
          name="settings.scoring.defaultPoints" hint="Each slide can override it.">
          <input id="scoring-default-points" type="number" min={1} max={PULSE_DECK_LIMITS.maxQuestionPoints} step={1}
            value={scoring.defaultPoints}
            onChange={(event) => setSettings("scoring", { defaultPoints: Number(event.target.value) })} />
        </Field>
      </fieldset>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>Answers</legend>
        <Field label="Answer editing" htmlFor="answers-edit-mode" errors={errors} name="settings.answers.editMode"
          hint={canEditAnswers ? "An edited answer is scored on the final locked response." : ANSWER_EDIT_RULE}>
          <select id="answers-edit-mode" value={answers.editMode}
            onChange={(event) => setSettings("answers", { editMode: event.target.value as PulseSettings["answers"]["editMode"] })}>
            <option value="locked_on_submit">Lock on submit</option>
            <option value="editable_until_close" disabled={!canEditAnswers} title={canEditAnswers ? undefined : ANSWER_EDIT_RULE}>
              Editable until the question closes
            </option>
          </select>
        </Field>
      </fieldset>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>Reveal</legend>
        <Check label="Show correct answer" checked={reveal.showCorrectAnswer} errors={errors} name="settings.reveal.showCorrectAnswer"
          onChange={(showCorrectAnswer) => setSettings("reveal", { showCorrectAnswer })} />
        <Check label="Show participant score" checked={reveal.showParticipantScore} errors={errors} name="settings.reveal.showParticipantScore"
          onChange={(showParticipantScore) => setSettings("reveal", { showParticipantScore })} />
        <Check label="Show rank" checked={reveal.showRank} errors={errors} name="settings.reveal.showRank"
          onChange={(showRank) => setSettings("reveal", { showRank })} />
        <Check label="Show answer review" checked={reveal.showAnswerReview} errors={errors} name="settings.reveal.showAnswerReview"
          onChange={(showAnswerReview) => setSettings("reveal", { showAnswerReview })} />
      </fieldset>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>Randomization</legend>
        <Check label="Randomization enabled" checked={randomization.enabled} errors={errors} name="settings.randomization.enabled"
          onChange={(enabled) => setSettings("randomization", { enabled })} />
        <Check label="Randomize questions" checked={randomization.randomizeQuestions}
          disabled={!randomization.enabled || !canRandomizeQuestions}
          hint={canRandomizeQuestions ? undefined : RANDOMIZE_QUESTIONS_RULE}
          errors={errors} name="settings.randomization.randomizeQuestions"
          onChange={(randomizeQuestions) => setSettings("randomization", { randomizeQuestions })} />
        <Check label="Randomize options" checked={randomization.randomizeOptions}
          disabled={!randomization.enabled || !canRandomizeOptions}
          hint={canRandomizeOptions ? undefined : RANDOMIZE_OPTIONS_RULE}
          errors={errors} name="settings.randomization.randomizeOptions"
          onChange={(randomizeOptions) => setSettings("randomization", { randomizeOptions })} />
      </fieldset>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>Leaderboard</legend>
        <Check label="Leaderboard enabled" checked={leaderboard.enabled} errors={errors} name="settings.leaderboard.enabled"
          onChange={(enabled) => setSettings("leaderboard", { enabled })} />
        <Check label="Host can show it manually" checked={leaderboard.showManually} disabled={!leaderboard.enabled}
          errors={errors} name="settings.leaderboard.showManually"
          onChange={(showManually) => setSettings("leaderboard", { showManually })} />
        <Check label="Show at the end" checked={leaderboard.showAtEnd} disabled={!leaderboard.enabled}
          errors={errors} name="settings.leaderboard.showAtEnd"
          onChange={(showAtEnd) => setSettings("leaderboard", { showAtEnd })} />
        <div className={styles.field}>
          <span className={styles.label}>Show after these questions</span>
          {mcqSlides.length === 0 && stale.length === 0 ? <p className={styles.hint}>Add MCQ slides to choose questions.</p> : null}
          {mcqSlides.map(({ slide, index }) => (
            <label key={slide.slideId} className={styles.inline}>
              <input type="checkbox" checked={leaderboard.showAfterQuestions.includes(slide.slideId)} disabled={!leaderboard.enabled}
                onChange={(event) => toggleLeaderboardSlide(slide.slideId, event.target.checked)} />
              Slide {index + 1}{slide.type === "mcq" && slide.content.text ? ` — ${slide.content.text}` : ""}
            </label>
          ))}
          {stale.map((slideId) => (
            <label key={slideId} className={styles.inline}>
              <input type="checkbox" checked onChange={() => toggleLeaderboardSlide(slideId, false)} />
              A slide that is no longer in the deck
            </label>
          ))}
          {Object.entries(errors).filter(([key]) => key.startsWith("settings.leaderboard.showAfterQuestions")).flatMap(([, m]) => m).length
            ? <p className={styles.error} role="alert">Uncheck slides that are no longer in the deck.</p> : null}
        </div>
      </fieldset>
    </div>
  );
}