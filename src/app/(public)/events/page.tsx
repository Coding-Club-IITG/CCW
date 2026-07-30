import Link from "next/link";
import { type EventRecurrenceType } from "@/lib/constants";
import { getEventStatus } from "@/lib/eventStatus";
import { cachedFetch, CACHE_TTLS } from "@/lib/cache";
import dbConnect from "@/lib/mongodb";
import { formatDate, logger } from "@/lib/utils";
import Event, { type IEvent } from "@/models/Event";
import StatusBadge from "@/components/shared/StatusBadge";
import CompatibleImage from "@/components/shared/CompatibleImage";
import styles from "./Events.module.scss";

function formatEventDate(startDate: Date, endDate?: Date): string {
  const start = formatDate(startDate);
  if (!endDate) return start;
  return `${start} - ${formatDate(endDate)}`;
}

function getRecurrenceLabel(
  recurrenceType?: EventRecurrenceType,
  recurrenceCount?: number,
): string | null {
  if (!recurrenceType || recurrenceType === "none") return null;
  const count = recurrenceCount || 1;
  const typeLabel =
    recurrenceType === "biweekly"
      ? "Every 2 weeks"
      : `${recurrenceType.charAt(0).toUpperCase() + recurrenceType.slice(1)}`;
  return `${typeLabel} · ${count} occurrence${count > 1 ? "s" : ""}`;
}

export default async function EventsPage() {
  let events: IEvent[] = [];
  let fetchError = false;

  try {
    await dbConnect();
    events = await cachedFetch<IEvent[]>(
      "ccw:events:public",
      CACHE_TTLS.EVENTS,
      async () => {
        const result = await Event.find({}).sort({ startDate: -1 }).lean();
        return result as unknown as IEvent[];
      },
    );
  } catch (error) {
    logger.error("Failed to fetch events", error);
    fetchError = true;
  }

  return (
    <div className={styles.container}>
      <h1>Events</h1>
      <p className={styles.subtitle}>
        Workshops, competitions, and activities organized by Coding Club IITG.
      </p>

      {fetchError && (
        <p className={styles.errorText}>
          Unable to load events. Please try again later.
        </p>
      )}

      {events.length === 0 && !fetchError ? (
        <div className={styles.emptyState}>
          <p>No events found. Stay tuned for upcoming activities!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {events.map((event) => {
            const status = getEventStatus(
              event.startDate,
              event.endDate,
              (event as any).recurrenceType,
              (event as any).recurrenceCount,
            );
            const recurrenceLabel = getRecurrenceLabel(
              (event as any).recurrenceType,
              (event as any).recurrenceCount,
            );

            return (
              <Link
                key={String(event._id)}
                href={`/events/${String(event._id)}`}
                className={styles.card}
              >
                {event.poster && (
                  <div className={styles.posterWrapper}>
                    <CompatibleImage
                      src={event.poster}
                      alt={event.title}
                      className={styles.poster}
                      width={640}
                      height={360}
                    />
                  </div>
                )}
                <div className={styles.cardContent}>
                  <div className={styles.badges}>
                    <StatusBadge status={status} />
                    {event.module && (
                      <span className={styles.moduleBadge}>{event.module}</span>
                    )}
                  </div>
                  <h2 className={styles.eventTitle}>{event.title}</h2>
                  {event.shortDescription && (
                    <p className={styles.shortDesc}>{event.shortDescription}</p>
                  )}
                  <span className={styles.date}>
                    {formatEventDate(event.startDate, event.endDate)}
                  </span>
                  {recurrenceLabel && (
                    <span className={styles.recurrence}>{recurrenceLabel}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
