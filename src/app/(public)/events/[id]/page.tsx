import { notFound } from "next/navigation";
import { type EventRecurrenceType } from "@/lib/constants";
import { getEventStatus } from "@/lib/eventStatus";
import dbConnect from "@/lib/mongodb";
import { formatDate, logger } from "@/lib/utils";
import Event, { type IEvent } from "@/models/Event";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import BackLink from "@/components/shared/BackLink";
import CompatibleImage from "@/components/shared/CompatibleImage";
import StatusBadge from "@/components/shared/StatusBadge";
import styles from "./EventDetail.module.scss";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EventDetailPage({ params }: Props) {
  const { id } = await params;

  let event: IEvent | null = null;

  try {
    await dbConnect();
    event = (await Event.findOne({
      _id: id,
      status: "published",
    }).lean()) as unknown as IEvent | null;
  } catch (error) {
    logger.error("Failed to fetch event", error);
  }

  if (!event) {
    notFound();
  }

  const recurrenceType = (event as any).recurrenceType as
    | EventRecurrenceType
    | undefined;
  const recurrenceCount = (event as any).recurrenceCount as number | undefined;

  const status = getEventStatus(
    event.startDate,
    event.endDate,
    recurrenceType,
    recurrenceCount,
  );
  const eventDateFormatter = event.allDay
    ? (value: Date) => formatDate(value)
    : (value: Date) =>
        new Intl.DateTimeFormat("en-IN", {
          timeZone: "Asia/Kolkata",
          dateStyle: "long",
          timeStyle: "short",
        }).format(value);
  const dateStr = event.endDate
    ? `${eventDateFormatter(event.startDate)} - ${eventDateFormatter(event.endDate)}`
    : eventDateFormatter(event.startDate);

  function getOccurrenceDates(): Date[] {
    if (!recurrenceType || recurrenceType === "none") return [];
    const count = recurrenceCount || 1;
    const dates: Date[] = [];
    const start = new Date(event!.startDate);
    for (let i = 0; i < count; i++) {
      const d = new Date(start);
      switch (recurrenceType) {
        case "daily":
          d.setDate(d.getDate() + i);
          break;
        case "weekly":
          d.setDate(d.getDate() + i * 7);
          break;
        case "biweekly":
          d.setDate(d.getDate() + i * 14);
          break;
        case "monthly":
          d.setMonth(d.getMonth() + i);
          break;
      }
      dates.push(d);
    }
    return dates;
  }

  const occurrences = getOccurrenceDates();

  return (
    <div className={styles.container}>
      <BackLink href="/events" label="All Events" />

      {event.poster && (
        <div className={styles.posterWrapper}>
          <CompatibleImage
            src={event.poster}
            alt={event.title}
            className={styles.poster}
            width={1200}
            height={675}
          />
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.badges}>
          <StatusBadge status={status} />
          {event.module && (
            <span className={styles.moduleBadge}>{event.module}</span>
          )}
        </div>
        <h1 className={styles.title}>{event.title}</h1>
        <span className={styles.date}>{dateStr}</span>
        {occurrences.length > 0 && (
          <div className={styles.occurrences}>
            <span className={styles.occurrenceLabel}>Occurs on:</span>
            <ul className={styles.occurrenceList}>
              {occurrences.map((date, i) => (
                <li key={i}>{eventDateFormatter(date)}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className={styles.content}>
        <MarkdownRenderer content={event.description} />
      </div>
    </div>
  );
}
