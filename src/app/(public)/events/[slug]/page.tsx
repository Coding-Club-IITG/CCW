import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MODULE_ACCENTS, type EventRecurrenceType } from "@/lib/constants";
import type { ProjectModuleName } from "@/lib/constants";
import {
  istEventWhen,
  istLongDate,
  recurrenceLabel,
} from "@/lib/events/listing";
import { getEventStatus } from "@/lib/eventStatus";
import dbConnect from "@/lib/mongodb";
import { logger } from "@/lib/utils";
import {
  CLUB_EMAIL,
  ogImage,
  pageMetadata,
  plainText,
  SITE_URL,
} from "@/lib/seo";
import Event, { type IEvent } from "@/models/Event";
import CalendarEvent from "@/models/CalendarEvent";
import FocalImage from "@/components/shared/FocalImage";
import MarkdownRenderer from "@/components/blog/MarkdownRenderer";
import BackLink from "@/components/shared/BackLink";
import JsonLd from "@/components/shared/JsonLd";
import EventActions from "./EventActions";
import styles from "./EventDetail.module.scss";

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
    image: ogImage(event.title, { media: event.poster }),
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
    EventRecurrenceType | undefined;
  const recurrenceCount = event.recurrenceCount;

  const status = getEventStatus(
    event.startDate,
    event.endDate,
    recurrenceType,
    recurrenceCount,
  );
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
        image: [ogImage(event.title, { media: event.poster })],
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

  // Same module first, then topped up with other recent events
  const RELATED_LIMIT = 3;
  const relatedSelect = "title slug module startDate allDay";
  const sameModule = event.module
    ? await Event.find({
        _id: { $ne: event._id },
        status: "published",
        module: event.module,
      })
        .select(relatedSelect)
        .sort({ startDate: -1 })
        .limit(RELATED_LIMIT)
        .lean()
    : [];
  const fillers =
    sameModule.length < RELATED_LIMIT
      ? await Event.find({
          _id: { $nin: [event._id, ...sameModule.map((item) => item._id)] },
          status: "published",
        })
          .select(relatedSelect)
          .sort({ startDate: -1 })
          .limit(RELATED_LIMIT - sameModule.length)
          .lean()
      : [];
  const relatedDocuments = [...sameModule, ...fillers];
  const related = relatedDocuments.map((item) => ({
    id: String(item._id),
    slug: item.slug,
    title: item.title,
    module: item.module as ProjectModuleName | undefined,
    when: istEventWhen(item.startDate, Boolean(item.allDay)),
  }));

  const accent = event.module
    ? (MODULE_ACCENTS[event.module as ProjectModuleName] ?? "var(--muted)")
    : "var(--muted)";
  const moduleLabel = event.module ?? event.tags?.[0] ?? "Coding Club";
  const recurrence = recurrenceLabel(recurrenceType, recurrenceCount);

  const facts = [
    { label: "date", value: istLongDate(event.startDate) },
    {
      label: "time",
      value: event.allDay
        ? "All day"
        : new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            timeStyle: "short",
          }).format(new Date(event.startDate)),
    },
    { label: "venue", value: location || "To be announced" },
    ...(event.publicAudience
      ? [{ label: "open to", value: event.publicAudience }]
      : recurrence
        ? [{ label: "repeats", value: recurrence }]
        : []),
  ];

  return (
    <div
      className={styles.page}
      style={{ "--accent": accent } as React.CSSProperties}
    >
      {eventJsonLd && <JsonLd data={eventJsonLd} />}

      <div className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroInner}>
          <BackLink href="/events" label="All events" />

          <div className={styles.split}>
            <div className={styles.main}>
              <p className={styles.kicker}>
                <span className={styles.status}>{status}</span>
                <span className={styles.module}>{moduleLabel}</span>
              </p>
              <h1 className={styles.title}>{event.title}</h1>
              {event.shortDescription && (
                <p className={styles.summary}>{event.shortDescription}</p>
              )}

              <dl className={styles.facts}>
                {facts.map((fact) => (
                  <div key={fact.label} className={styles.fact}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>

              {occurrences.length > 1 && (
                <section className={styles.occurrences}>
                  <h2 className={styles.occurrenceLabel}>
                    {recurrence ?? "Occurs on"}
                  </h2>
                  <ul className={styles.occurrenceList}>
                    {occurrences.map((date) => (
                      <li key={date.toISOString()}>
                        {istEventWhen(date, event.allDay)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <div className={styles.prose}>
                <MarkdownRenderer content={event.description} />
              </div>
            </div>

            <aside className={styles.rail}>
              <div className={styles.railInner}>
                <div className={styles.posterWrapper}>
                  {event.poster && (
                    <FocalImage
                      src={event.poster}
                      focalPoint={event.posterFocalPoint}
                      alt=""
                      width={720}
                      height={900}
                      sizes="(max-width: 1000px) 100vw, 360px"
                      priority
                      className={styles.poster}
                    />
                  )}
                </div>

                <EventActions
                  slug={event.slug}
                  title={event.title}
                  shareText={event.shortDescription || event.title}
                />

                <div className={styles.organiser}>
                  <p className={styles.organiserLabel}>Organised by</p>
                  <p className={styles.organiserValue}>
                    {event.module
                      ? `${event.module} module`
                      : "Coding Club IITG"}
                  </p>
                  <a
                    href={`mailto:${CLUB_EMAIL}`}
                    className={styles.organiserLink}
                  >
                    {CLUB_EMAIL}
                  </a>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className={styles.related} aria-labelledby="more-events">
          <div className={styles.relatedHeader}>
            <h2 id="more-events" className={styles.relatedHeading}>
              More events
            </h2>
            <Link href="/events" className={styles.relatedAll}>
              All events
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.relatedGrid}>
            {related.map((item) => (
              <Link
                key={item.id}
                href={`/events/${item.slug}`}
                className={styles.relatedCard}
                style={
                  {
                    "--accent": item.module
                      ? (MODULE_ACCENTS[item.module] ?? "var(--muted)")
                      : "var(--muted)",
                  } as React.CSSProperties
                }
              >
                <span className={styles.relatedModule}>
                  {item.module ?? "Coding Club"}
                </span>
                <span className={styles.relatedTitle}>{item.title}</span>
                <span className={styles.relatedWhen}>{item.when}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
