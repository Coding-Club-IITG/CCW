"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCalendarEvent,
  updateCalendarEvent,
} from "@/lib/actions/calendar";
import { APP_TIME_ZONE, EVENT_RECURRENCE_TYPES } from "@/lib/constants";
import type { CalendarScopeTarget } from "@/lib/access/calendar";
import MarkdownEditor from "@/components/shared/MarkdownEditor";
import styles from "./CalendarEventForm.module.scss";

interface InitialCalendarEvent {
  _id: string;
  title: string;
  description: string;
  scope: "general" | "module";
  module?: string;
  allDay: boolean;
  startAt: string;
  endAt?: string;
  recurrenceType: string;
  recurrenceCount: number;
  location: string;
  externalUrl: string;
  agenda: string;
  minutes: string;
  remindOneDayBefore: boolean;
}

function istParts(value?: string) {
  if (!value) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}

export default function CalendarEventForm({
  scopes,
  initialEvent,
}: {
  scopes: CalendarScopeTarget[];
  initialEvent?: InitialCalendarEvent;
}) {
  const router = useRouter();
  const initialStart = istParts(initialEvent?.startAt);
  const initialEnd = istParts(initialEvent?.endAt);
  const firstScope = initialEvent
    ? initialEvent.scope === "general"
      ? "general"
      : `module:${initialEvent.module}`
    : scopes[0]?.scope === "general"
      ? "general"
      : `module:${scopes[0]?.module ?? ""}`;
  const [form, setForm] = useState({
    title: initialEvent?.title ?? "",
    description: initialEvent?.description ?? "",
    scopeKey: firstScope,
    allDay: initialEvent?.allDay ?? false,
    startDate: initialStart.date,
    startTime: initialStart.time,
    endDate: initialEnd.date,
    endTime: initialEnd.time,
    recurrenceType: initialEvent?.recurrenceType ?? "none",
    recurrenceCount: String(initialEvent?.recurrenceCount ?? 1),
    location: initialEvent?.location ?? "",
    externalUrl: initialEvent?.externalUrl ?? "",
    agenda: initialEvent?.agenda ?? "",
    minutes: initialEvent?.minutes ?? "",
    remindOneDayBefore: initialEvent?.remindOneDayBefore ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setSaving(true);
    setError("");
    const selectedModule = form.scopeKey.startsWith("module:")
      ? form.scopeKey.slice("module:".length)
      : undefined;
    const payload = {
      ...form,
      scope: selectedModule ? "module" : "general",
      module: selectedModule,
      recurrenceCount: Number(form.recurrenceCount),
    };
    const result = initialEvent
      ? await updateCalendarEvent(initialEvent._id, payload)
      : await createCalendarEvent(payload);
    if (result.ok) {
      const id = initialEvent?._id ?? String(result.data._id);
      router.push(`/internal/calendar/${id}`);
      router.refresh();
      return;
    }
    setError(result.error.message);
    setSaving(false);
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <label>
        Title
        <input
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          maxLength={200}
          required
        />
      </label>
      <label>
        Scope
        <select
          value={form.scopeKey}
          onChange={(e) => set("scopeKey", e.target.value)}
          required
        >
          {scopes.map((scope) => {
            const value =
              scope.scope === "general" ? "general" : `module:${scope.module}`;
            return (
              <option key={value} value={value}>
                {scope.scope === "general" ? "General" : scope.module}
              </option>
            );
          })}
        </select>
      </label>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={form.allDay}
          onChange={(e) => set("allDay", e.target.checked)}
        />
        All-day event
      </label>
      <div className={styles.row}>
        <label>
          Start date
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            required
          />
        </label>
        {!form.allDay && (
          <label>
            Start time
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
              required
            />
          </label>
        )}
        <label>
          End date
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </label>
        {!form.allDay && form.endDate && (
          <label>
            End time
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => set("endTime", e.target.value)}
              required
            />
          </label>
        )}
      </div>
      <div className={styles.row}>
        <label>
          Recurrence
          <select
            value={form.recurrenceType}
            onChange={(e) => set("recurrenceType", e.target.value)}
            required
          >
            {EVENT_RECURRENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type === "none" ? "Does not repeat" : type}
              </option>
            ))}
          </select>
        </label>
        {form.recurrenceType !== "none" && (
          <label>
            Occurrences
            <input
              type="number"
              min={1}
              max={52}
              value={form.recurrenceCount}
              onChange={(e) => set("recurrenceCount", e.target.value)}
              required
            />
          </label>
        )}
      </div>
      <label>
        Location
        <input
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          maxLength={500}
        />
      </label>
      <label>
        External meeting or resource URL
        <input
          type="url"
          value={form.externalUrl}
          onChange={(e) => set("externalUrl", e.target.value)}
          maxLength={2000}
        />
      </label>
      <div className={styles.markdownField}>
        <label htmlFor="calendar-description">Description (Markdown)</label>
        <MarkdownEditor
          id="calendar-description"
          value={form.description}
          onChange={(value) => set("description", value)}
          placeholder="Internal event details..."
          rows={8}
        />
      </div>
      <div className={styles.markdownField}>
        <label htmlFor="calendar-agenda">Agenda (Markdown)</label>
        <MarkdownEditor
          id="calendar-agenda"
          value={form.agenda}
          onChange={(value) => set("agenda", value)}
          placeholder="Topics and preparation notes..."
          rows={7}
        />
      </div>
      <div className={styles.markdownField}>
        <label htmlFor="calendar-minutes">Minutes (Markdown)</label>
        <MarkdownEditor
          id="calendar-minutes"
          value={form.minutes}
          onChange={(value) => set("minutes", value)}
          placeholder="Decisions and follow-ups..."
          rows={7}
        />
      </div>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={form.remindOneDayBefore}
          onChange={(e) => set("remindOneDayBefore", e.target.checked)}
        />
        Notify members one day before
      </label>
      <div className={styles.actions}>
        <button type="submit" disabled={saving || scopes.length === 0}>
          {saving
            ? "Saving…"
            : initialEvent
              ? "Save changes"
              : "Create calendar event"}
        </button>
      </div>
    </form>
  );
}
