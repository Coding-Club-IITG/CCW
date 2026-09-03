import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { listCalendarEvents } from "@/lib/actions/calendar";
import { getCreatableCalendarScopes } from "@/lib/access/calendar";
import { parseManagedModules } from "@/lib/roles";
import CalendarView from "@/components/calendar/CalendarView";
import type { CalendarEventView } from "@/components/calendar/types";
import styles from "./Calendar.module.scss";

function validMonth(value?: string) {
  if (value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    public?: string;
    scope?: string;
    time?: string;
  }>;
}) {
  const query = await searchParams;
  const timeFilter = query.time ?? "all";
  const month = validMonth(query.month);
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(`${month}-01T00:00:00+05:30`);
  const endMonth = new Date(Date.UTC(year, monthNumber, 1));
  const endKey = `${endMonth.getUTCFullYear()}-${String(endMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const end = new Date(`${endKey}T00:00:00+05:30`);
  const [result, session] = await Promise.all([
    listCalendarEvents(start.toISOString(), end.toISOString()),
    auth.api.getSession({ headers: await headers() }),
  ]);
  const user = session!.user as { access?: string; managedModules?: unknown };
  const scopes = getCreatableCalendarScopes(
    user.access,
    parseManagedModules(user.managedModules),
  );
  let events = result.ok ? (result.data as CalendarEventView[]) : [];
  if (query.public === "linked")
    events = events.filter((event) => event.publicEventId);
  if (query.public === "unlinked")
    events = events.filter((event) => !event.publicEventId);
  if (query.scope === "general")
    events = events.filter((event) => event.scope === "general");
  if (query.scope === "module")
    events = events.filter((event) => event.scope === "module");
  const now = new Date().toISOString();
  if (timeFilter === "upcoming")
    events = events
      .map((event) => ({
        ...event,
        occurrences: event.occurrences.filter(
          (occurrence) => occurrence.startAt >= now,
        ),
      }))
      .filter((event) => event.occurrences.length > 0);
  if (timeFilter === "past")
    events = events
      .map((event) => ({
        ...event,
        occurrences: event.occurrences.filter(
          (occurrence) => occurrence.startAt < now,
        ),
      }))
      .filter((event) => event.occurrences.length > 0);
  const filterHref = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    params.set("month", month);
    for (const [key, value] of Object.entries({
      public: query.public,
      scope: query.scope,
      time: timeFilter,
      ...changes,
    })) {
      if (value) params.set(key, value);
    }
    return `/internal/calendar?${params}`;
  };

  return (
    <div>
      <header className={styles.header}>
        <div>
          <h1>Club Calendar</h1>
          <p>General and module schedules for all members.</p>
        </div>
        {scopes.length > 0 && (
          <Link href="/internal/calendar/new" className={styles.primaryAction}>
            Add calendar event
          </Link>
        )}
      </header>
      {scopes.length > 0 && (
        <nav className={styles.filters} aria-label="Calendar filters">
          <Link
            href={filterHref({
              public: undefined,
              scope: undefined,
              time: "all",
            })}
            data-active={!query.public && !query.scope && timeFilter === "all"}
          >
            All
          </Link>
          <Link
            href={filterHref({ public: "linked" })}
            data-active={query.public === "linked"}
          >
            Public event
          </Link>
          <Link
            href={filterHref({ public: "unlinked" })}
            data-active={query.public === "unlinked"}
          >
            Internal event
          </Link>
          <Link
            href={filterHref({ scope: "general" })}
            data-active={query.scope === "general"}
          >
            General
          </Link>
          <Link
            href={filterHref({ scope: "module" })}
            data-active={query.scope === "module"}
          >
            Module events
          </Link>
          <Link
            href={filterHref({ time: "upcoming" })}
            data-active={timeFilter === "upcoming"}
          >
            Upcoming
          </Link>
          <Link
            href={filterHref({ time: "past" })}
            data-active={timeFilter === "past"}
          >
            Past
          </Link>
        </nav>
      )}
      {!result.ok && <p className={styles.error}>{result.error.message}</p>}
      <CalendarView initialMonth={month} events={events} />
    </div>
  );
}
