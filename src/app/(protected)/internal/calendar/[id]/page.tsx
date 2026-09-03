import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  canManageCalendarEvent,
  canPublishCalendarEvent,
} from "@/lib/access/calendar";
import dbConnect from "@/lib/mongodb";
import { parseManagedModules } from "@/lib/roles";
import CalendarEvent from "@/models/CalendarEvent";
import Event from "@/models/Event";
import BackLink from "@/components/shared/BackLink";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import CalendarEventActions from "@/components/calendar/CalendarEventActions";
import styles from "../Calendar.module.scss";

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "long",
  timeStyle: "short",
});
const DATE = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  dateStyle: "long",
});

export default async function CalendarEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  await dbConnect();
  void Event;
  const event = await CalendarEvent.findById(id)
    .populate("publicEventId")
    .lean();
  if (!event) notFound();
  const user = session!.user as { access?: string; managedModules?: unknown };
  const roles = parseManagedModules(user.managedModules);
  const target =
    event.scope === "module"
      ? { scope: "module" as const, module: event.module ?? "" }
      : { scope: "general" as const };
  const canManage = canManageCalendarEvent(user.access, roles, target);
  const canPublish = canPublishCalendarEvent(user.access, roles, target);
  const publicEvent =
    event.publicEventId &&
    typeof event.publicEventId === "object" &&
    "_id" in event.publicEventId
      ? (event.publicEventId as unknown as {
          _id: unknown;
          slug: string;
          status: string;
        })
      : null;
  const format = event.allDay ? DATE : DATE_TIME;
  return (
    <div>
      <BackLink href="/internal/calendar" label="Back to Calendar" />
      <article className={styles.detail}>
        <header>
          <h1>{event.title}</h1>
          <div className={styles.meta}>
            <span>{event.module ?? "General"}</span>
            <span>
              {format.format(event.startAt)}
              {event.endAt ? ` – ${format.format(event.endAt)}` : ""}
            </span>
            {event.recurrenceType !== "none" && (
              <span>
                {event.recurrenceType} · {event.recurrenceCount} occurrences
              </span>
            )}
            {event.remindOneDayBefore && <span>One-day reminder enabled</span>}
          </div>
        </header>
        {(event.location || event.externalUrl) && (
          <section className={styles.section}>
            <h2>Where</h2>
            {event.location && <p>{event.location}</p>}
            {event.externalUrl && (
              <p>
                <a href={event.externalUrl} target="_blank" rel="noreferrer">
                  Open meeting or resource link
                </a>
              </p>
            )}
          </section>
        )}
        {event.description && (
          <section className={styles.section}>
            <h2>Details</h2>
            <MarkdownRenderer content={event.description} />
          </section>
        )}
        {event.agenda && (
          <section className={styles.section}>
            <h2>Before the meeting</h2>
            <MarkdownRenderer content={event.agenda} />
          </section>
        )}
        {event.minutes && (
          <section className={styles.section}>
            <h2>After the meeting</h2>
            <MarkdownRenderer content={event.minutes} />
          </section>
        )}
        {publicEvent && (
          <section className={styles.section}>
            <h2>Public event</h2>
            <p>Status: {publicEvent.status}</p>
            {publicEvent.status === "published" && (
              <BackLink
                href={`/events/${publicEvent.slug}`}
                label="View public page"
              />
            )}
          </section>
        )}
        {(canManage || canPublish) && (
          <CalendarEventActions
            id={id}
            publicEventId={publicEvent ? String(publicEvent._id) : undefined}
            canManage={canManage}
            canPublish={canPublish}
          />
        )}
      </article>
    </div>
  );
}
