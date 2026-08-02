import Link from "next/link";
import type { CalendarEventView, CalendarOccurrenceView } from "./types";
import styles from "./CalendarView.module.scss";

interface Props {
  initialMonth: string;
  events: CalendarEventView[];
}

const IST_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
});

const IST_DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "numeric",
  month: "short",
});

function monthParts(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const now = new Date();
  return match
    ? { year: Number(match[1]), month: Number(match[2]) - 1 }
    : { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

function monthKey(year: number, month: number) {
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function istDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function occurrenceDateKeys(occurrence: CalendarOccurrenceView) {
  const start = istDateKey(occurrence.startAt);
  const end = istDateKey(occurrence.endAt ?? occurrence.startAt);
  const keys: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function EventLink({
  event,
  occurrence,
  compact = false,
}: {
  event: CalendarEventView;
  occurrence: CalendarOccurrenceView;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/internal/calendar/${event._id}`}
      className={compact ? styles.compactEvent : styles.upcomingEvent}
      aria-label={`${event.title}, ${event.module ?? "General"}`}
    >
      <span className={styles.eventTitle}>{event.title}</span>
      {!compact && (
        <>
          <span className={styles.eventMeta}>
            {IST_DATE_FORMAT.format(new Date(occurrence.startAt))} ·{" "}
            {event.allDay
              ? "All day"
              : IST_FORMAT.format(new Date(occurrence.startAt))}
            {event.location ? ` · ${event.location}` : ""}
          </span>
          <span className={styles.scopeBadge}>{event.module ?? "General"}</span>
        </>
      )}
    </Link>
  );
}

export default function CalendarView({ initialMonth, events }: Props) {
  const { year, month } = monthParts(initialMonth);
  const firstDay = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = firstDay.getUTCDay();
  const monthLabel = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(firstDay);
  const byDate = new Map<
    string,
    Array<{ event: CalendarEventView; occurrence: CalendarOccurrenceView }>
  >();
  for (const event of events) {
    for (const occurrence of event.occurrences) {
      for (const key of occurrenceDateKeys(occurrence)) {
        const values = byDate.get(key) ?? [];
        values.push({ event, occurrence });
        byDate.set(key, values);
      }
    }
  }
  const monthEvents = events
    .flatMap((event) =>
      event.occurrences.map((occurrence) => ({ event, occurrence })),
    )
    .sort((a, b) => a.occurrence.startAt.localeCompare(b.occurrence.startAt));

  return (
    <div className={styles.layout}>
      <section className={styles.calendar} aria-label="Month calendar">
        <header className={styles.monthHeader}>
          <Link
            href={`/internal/calendar?month=${monthKey(year, month - 1)}`}
            aria-label="Previous month"
          >
            ‹
          </Link>
          <h2>{monthLabel}</h2>
          <Link
            href={`/internal/calendar?month=${monthKey(year, month + 1)}`}
            aria-label="Next month"
          >
            ›
          </Link>
        </header>
        <div className={styles.weekdays} aria-hidden="true">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className={styles.grid}>
          {Array.from({ length: offset }, (_, index) => (
            <div key={`empty-${index}`} className={styles.emptyDay} />
          ))}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1;
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            return (
              <div key={key} className={styles.day}>
                <time dateTime={key}>{day}</time>
                <div className={styles.dayEvents}>
                  {(byDate.get(key) ?? []).map(({ event, occurrence }) => (
                    <EventLink
                      key={`${event._id}-${occurrence.index}`}
                      event={event}
                      occurrence={occurrence}
                      compact
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <aside className={styles.monthEvents}>
        <h2>Events this month</h2>
        {monthEvents.length === 0 ? (
          <p>No events this month.</p>
        ) : (
          monthEvents.map(({ event, occurrence }) => (
            <EventLink
              key={`${event._id}-${occurrence.index}`}
              event={event}
              occurrence={occurrence}
            />
          ))
        )}
      </aside>
    </div>
  );
}
