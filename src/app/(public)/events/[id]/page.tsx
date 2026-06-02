import { notFound } from "next/navigation";
import { IST_OFFSET_MS, type EventStatus } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { formatDate, logger } from "@/lib/utils";
import Event, { type IEvent } from "@/models/Event";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import BackLink from "@/components/shared/BackLink";
import StatusBadge from "@/components/shared/StatusBadge";
import styles from "./EventDetail.module.scss";

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

  const status = getEventStatus(event.startDate, event.endDate);
  const dateStr = event.endDate
    ? `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`
    : formatDate(event.startDate);

  return (
    <div className={styles.container}>
      <BackLink href="/events" label="All Events" />

      <div className={styles.posterWrapper}>
        <img src={event.poster} alt={event.title} className={styles.poster} />
      </div>

      <div className={styles.header}>
        <div className={styles.badges}>
          <StatusBadge status={status} />
          {event.module && (
            <span className={styles.moduleBadge}>{event.module}</span>
          )}
        </div>
        <h1 className={styles.title}>{event.title}</h1>
        <span className={styles.date}>{dateStr}</span>
      </div>

      <div className={styles.content}>
        <MarkdownRenderer content={event.description} />
      </div>
    </div>
  );
}
