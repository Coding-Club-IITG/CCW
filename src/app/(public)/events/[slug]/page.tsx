import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { type EventRecurrenceType } from "@/lib/constants";
import { getEventStatus } from "@/lib/eventStatus";
import dbConnect from "@/lib/mongodb";
import { formatDate, logger } from "@/lib/utils";
import Event, { type IEvent } from "@/models/Event";
import CalendarEvent from "@/models/CalendarEvent";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import BackLink from "@/components/shared/BackLink";
import CompatibleImage from "@/components/shared/CompatibleImage";
import StatusBadge from "@/components/shared/StatusBadge";
import styles from "./EventDetail.module.scss";
import JsonLd from "@/components/shared/JsonLd";
import { ogImage, pageMetadata, plainText, SITE_URL } from "@/lib/seo";

interface Props {
  params: Promise<{ slug: string }>;
}

type PublicEvent = Omit<IEvent, "calendarEventId"> & {
  calendarEventId: { location?: string };
};

async function findEvent(slug: string): Promise<PublicEvent | null> {
  await dbConnect();
  void CalendarEvent;
  return (await Event.findOne({ slug, status: "published" })
    .populate({ path: "calendarEventId", select: "location" })
    .lean()) as unknown as PublicEvent | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await findEvent(slug);
  if (!event) return {};
  return pageMetadata({
    title: event.title,
    description: plainText(
      event.shortDescription || event.description,
      `Details for ${event.title}.`,
    ),
    path: `/events/${event.slug}`,
    image: ogImage(event.title, event.poster),
  });
}

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params;

  let event: PublicEvent | null = null;

  try {
    event = await findEvent(slug);
  } catch (error) {
    logger.error("Failed to fetch event", error);
  }

  if (!event) {
    notFound();
  }

  const recurrenceType = event.recurrenceType as
    | EventRecurrenceType
    | undefined;
  const recurrenceCount = event.recurrenceCount;

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
  const location = event.calendarEventId?.location?.trim();
  const eventUrl = `${SITE_URL}/events/${event.slug}`;
  const eventJsonLd = location
    ? {
        "@context": "https://schema.org",
        "@type": "Event",
        name: event.title,
        description: plainText(
          event.shortDescription || event.description,
          `Details for ${event.title}.`,
        ),
        url: eventUrl,
        image: [ogImage(event.title, event.poster)],
        startDate: event.startDate.toISOString(),
        ...(event.endDate ? { endDate: event.endDate.toISOString() } : {}),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        location: { "@type": "Place", name: location, address: location },
        ...(recurrenceType && recurrenceType !== "none"
          ? {
              eventSchedule: {
                "@type": "Schedule",
                startDate: event.startDate.toISOString().slice(0, 10),
                repeatCount: recurrenceCount || 1,
                repeatFrequency:
                  recurrenceType === "daily"
                    ? "P1D"
                    : recurrenceType === "weekly"
                      ? "P1W"
                      : recurrenceType === "biweekly"
                        ? "P2W"
                        : "P1M",
              },
            }
          : {}),
      }
    : null;

  return (
    <div className={styles.container}>
      {eventJsonLd && <JsonLd data={eventJsonLd} />}
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
        {location && (
          <div className={styles.location}>
            <MapPin aria-hidden="true" size={16} />
            <span>{location}</span>
          </div>
        )}
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
