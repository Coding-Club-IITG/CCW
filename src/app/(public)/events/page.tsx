import Link from "next/link";
import { IST_OFFSET_MS, type EventStatus } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { formatDate, logger } from "@/lib/utils";
import Event, { type IEvent } from "@/models/Event";
import StatusBadge from "@/components/shared/StatusBadge";
import styles from "./Events.module.scss";

function getEventStatus(startDate: Date, endDate?: Date): EventStatus {
  const now = new Date(Date.now() + IST_OFFSET_MS);
  const start = new Date(new Date(startDate).getTime() + IST_OFFSET_MS);
  const end = endDate
    ? new Date(new Date(endDate).getTime() + IST_OFFSET_MS)
    : null;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventStart = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const eventEnd = end
    ? new Date(end.getFullYear(), end.getMonth(), end.getDate())
    : eventStart;

  if (todayStart < eventStart) return "Upcoming";
  if (todayStart > eventEnd) return "Completed";
  return "Ongoing";
}

function formatEventDate(startDate: Date, endDate?: Date): string {
  const start = formatDate(startDate);
  if (!endDate) return start;
  return `${start} – ${formatDate(endDate)}`;
}

export default async function EventsPage() {
  let events: IEvent[] = [];
  let fetchError = false;

  try {
    await dbConnect();
    events = (await Event.find({})
      .sort({ startDate: -1 })
      .lean()) as unknown as IEvent[];
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
            const status = getEventStatus(event.startDate, event.endDate);

            return (
              <Link
                key={String(event._id)}
                href={`/events/${String(event._id)}`}
                className={styles.card}
              >
                <div className={styles.posterWrapper}>
                  <img
                    src={event.poster}
                    alt={event.title}
                    className={styles.poster}
                  />
                </div>
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
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
