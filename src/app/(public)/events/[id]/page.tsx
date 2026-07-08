import { notFound } from "next/navigation";
import { type EventRecurrenceType } from "@/lib/constants";
import { getEventStatus } from "@/lib/eventStatus";
import dbConnect from "@/lib/mongodb";
import { formatDate, logger } from "@/lib/utils";
import Event, { type IEvent } from "@/models/Event";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import BackLink from "@/components/shared/BackLink";
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
    event = (await Event.findById(id).lean()) as unknown as IEvent | null;
  } catch (error) {
    logger.error("Failed to fetch event", error);
  }

  if (!event) {
    notFound();
  }

  const recurrenceType = (event as any).recurrenceType as
    EventRecurrenceType | undefined;
  const recurrenceCount = (event as any).recurrenceCount as number | undefined;

  const status = getEventStatus(
    event.startDate,
    event.endDate,
    recurrenceType,
    recurrenceCount,
  );
  const dateStr = event.endDate
    ? `${formatDate(event.startDate)} - ${formatDate(event.endDate)}`
    : formatDate(event.startDate);

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
          <img src={event.poster} alt={event.title} className={styles.poster} />
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
                <li key={i}>{formatDate(date)}</li>
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
