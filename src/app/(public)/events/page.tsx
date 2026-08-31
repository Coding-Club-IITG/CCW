import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import FocalImage from "@/components/shared/FocalImage";
import { buildCacheKey, cachedFetch, CACHE_TTLS } from "@/lib/cache";
import { MODULE_ACCENTS, PROJECT_MODULES } from "@/lib/constants";
import type { ProjectModuleName } from "@/lib/constants";
import { formatEventDate } from "@/lib/eventDate";
import { getEventStatus } from "@/lib/eventStatus";
import {
  ARCHIVE_STEP,
  archiveShown,
  eventsHref,
  eventView,
  groupByMonth,
  istDay,
  istTime,
  recurrenceLabel,
  type EventQuery,
} from "@/lib/events/listing";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";
import dbConnect from "@/lib/mongodb";
import { pageMetadata } from "@/lib/seo";
import { errorToLogMetadata, logger } from "@/lib/utils";
import CalendarEvent from "@/models/CalendarEvent";
import Event from "@/models/Event";
import EmptyState from "@/components/public/EmptyState";
import PageHeader from "@/components/public/PageHeader";
import EventFilters from "./EventFilters";
import EventPreview, { type PreviewEvent } from "./EventPreview";
import styles from "./Events.module.scss";

export const metadata: Metadata = pageMetadata({
  title: "Events",
  description:
    "Workshops, competitions, and technical activities organized by Coding Club IITG.",
  path: "/events",
});

type Props = { searchParams: Promise<EventQuery> };

type ListedEvent = {
  _id: string;
  slug: string;
  title: string;
  shortDescription: string;
  poster?: string;
  posterFocalPoint?: ImageFocalPoint;
  module?: ProjectModuleName;
  tags: string[];
  startDate: string;
  endDate?: string;
  allDay: boolean;
  recurrenceType?: Parameters<typeof recurrenceLabel>[0];
  recurrenceCount?: number;
  location: string;
};

function accentFor(moduleName?: string) {
  return moduleName
    ? (MODULE_ACCENTS[moduleName as ProjectModuleName] ?? "var(--muted)")
    : "var(--muted)";
}

/**
 * Module when the event has one, otherwise its first tag
 */
function classify(event: ListedEvent) {
  if (event.module) {
    return { label: event.module, accent: accentFor(event.module) };
  }
  return {
    label: event.tags[0] ?? "Coding Club",
    accent: "var(--muted)",
  };
}

function toPreview(event: ListedEvent): PreviewEvent {
  const { label, accent } = classify(event);
  return {
    _id: event._id,
    slug: event.slug,
    title: event.title,
    shortDescription: event.shortDescription,
    poster: event.poster,
    posterFocalPoint: event.posterFocalPoint,
    moduleLabel: label,
    accent,
    status: getEventStatus(
      event.startDate,
      event.endDate,
      event.recurrenceType,
      event.recurrenceCount,
    ),
    when: formatEventDate(event.startDate, undefined, event.allDay),
    where: event.location || "To be announced",
    starts: formatEventDate(event.startDate, undefined, event.allDay),
    ends: event.endDate
      ? formatEventDate(event.endDate, undefined, event.allDay)
      : "—",
    recurrence:
      recurrenceLabel(event.recurrenceType, event.recurrenceCount) ??
      "One-off event",
    tags: event.tags,
  };
}

async function getEvents(): Promise<ListedEvent[]> {
  await dbConnect();
  void CalendarEvent;

  return cachedFetch(
    buildCacheKey("events:public:v3"),
    CACHE_TTLS.EVENTS,
    async () => {
      const events = await Event.find({ status: "published" })
        .select(
          "title slug shortDescription poster posterFocalPoint module tags startDate endDate allDay recurrenceType recurrenceCount calendarEventId",
        )
        .populate("calendarEventId", "location")
        .sort({ startDate: -1 })
        .lean();

      // Only the calendar's location is public
      const listed = events.map((event) => {
        const { calendarEventId, ...rest } = event as typeof event & {
          calendarEventId?: { location?: string };
        };
        return { ...rest, location: calendarEventId?.location ?? "" };
      });

      return JSON.parse(JSON.stringify(listed)) as ListedEvent[];
    },
  );
}

export default async function EventsPage({ searchParams }: Props) {
  const query = await searchParams;
  const view = eventView(query.view);
  const activeModule = query.module?.trim() ?? "";

  let events: ListedEvent[] = [];
  let failed = false;
  try {
    events = await getEvents();
  } catch (error) {
    logger.error("Failed to fetch events", {
      route: "/events",
      operation: "list_events",
      ...errorToLogMetadata(error),
    });
    failed = true;
  }

  const modules = PROJECT_MODULES.filter((moduleName) =>
    events.some((event) => event.module === moduleName),
  );
  const filtered = activeModule
    ? events.filter((event) => event.module === activeModule)
    : events;

  const statusOf = (event: ListedEvent) =>
    getEventStatus(
      event.startDate,
      event.endDate,
      event.recurrenceType,
      event.recurrenceCount,
    );

  // Soonest first for upcoming, newest first for the archive
  const upcoming = filtered
    .filter((event) => statusOf(event) !== "Completed")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = filtered.filter((event) => statusOf(event) === "Completed");

  const [nextUp, ...restUpcoming] = upcoming;
  const shown = archiveShown(query.show, past.length);
  const visiblePast = past.slice(0, shown);
  const archiveProgress = past.length
    ? Math.round((visiblePast.length / past.length) * 100)
    : 100;

  const countLabel = `${events.length} ${events.length === 1 ? "event" : "events"} published`;

  function renderCollection(items: ListedEvent[]) {
    if (view === "timeline") {
      return (
        <div className={styles.timeline}>
          {groupByMonth(items).map((group) => (
            <section key={group.key} className={styles.month}>
              <div className={styles.monthHeader}>
                <span className={styles.monthLabel}>{group.label}</span>
                <span className={styles.monthCount}>
                  {group.items.length}{" "}
                  {group.items.length === 1 ? "event" : "events"}
                </span>
              </div>

              {group.items.map((event) => {
                const { label, accent } = classify(event);
                return (
                  <Link
                    key={event._id}
                    href={`/events/${event.slug}`}
                    className={styles.timelineRow}
                    style={{ "--accent": accent } as React.CSSProperties}
                  >
                    <span className={styles.spine} aria-hidden="true" />
                    <span className={styles.node} aria-hidden="true" />
                    <span className={styles.wash} aria-hidden="true" />

                    <span className={styles.timelineWhen}>
                      <span className={styles.timelineDay}>
                        {istDay(event.startDate)}
                      </span>
                      <span className={styles.timelineTime}>
                        {istTime(event.startDate, event.allDay)}
                      </span>
                    </span>

                    <span className={styles.timelineHeading}>
                      <span className={styles.timelineTitle}>
                        {event.title}
                      </span>
                      <span className={styles.timelineMeta}>
                        <span style={{ color: accent }}>{label}</span>
                        <span aria-hidden="true">·</span>
                        <span>{event.location || "To be announced"}</span>
                      </span>
                    </span>

                    <span className={styles.timelineDescription}>
                      {event.shortDescription}
                    </span>

                    <span className={styles.timelineEnd}>
                      <span className={styles.timelineStatus}>
                        {statusOf(event)}
                      </span>
                      <span className={styles.timelineArrow} aria-hidden="true">
                        <ArrowRight size={14} />
                      </span>
                    </span>
                  </Link>
                );
              })}
            </section>
          ))}
        </div>
      );
    }

    return (
      <div className={styles.grid}>
        {items.map((event) => (
          <EventPreview key={event._id} event={toPreview(event)} />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        kicker={countLabel}
        title="Events"
        glow="red"
        lead="Workshops, mock rounds, talks and contests. Most are open to anyone on campus, whatever year you are in and whatever you already know."
      />

      <EventFilters
        modules={[...modules]}
        activeModule={activeModule}
        view={view}
        query={query}
      />

      {failed && (
        <p className={styles.error}>
          Unable to load events. Please try again later.
        </p>
      )}

      {nextUp && (
        <Link href={`/events/${nextUp.slug}`} className={styles.nextUp}>
          <div className={styles.nextUpMedia}>
            {nextUp.poster && (
              <FocalImage
                src={nextUp.poster}
                focalPoint={nextUp.posterFocalPoint}
                alt=""
                width={680}
                height={850}
                sizes="(max-width: 900px) 100vw, 340px"
                priority
                className={styles.nextUpPoster}
              />
            )}
          </div>
          <div className={styles.nextUpBody}>
            <p className={styles.nextUpKicker}>
              <span className={styles.nextUpBadge}>Next up</span>
              <span style={{ color: classify(nextUp).accent }}>
                {classify(nextUp).label}
              </span>
            </p>
            <h2 className={styles.nextUpTitle}>{nextUp.title}</h2>
            {nextUp.shortDescription && (
              <p className={styles.nextUpDescription}>
                {nextUp.shortDescription}
              </p>
            )}
            <dl className={styles.nextUpFacts}>
              <div>
                <dt>when</dt>
                <dd>
                  {formatEventDate(
                    nextUp.startDate,
                    nextUp.endDate,
                    nextUp.allDay,
                  )}
                </dd>
              </div>
              <div>
                <dt>where</dt>
                <dd>{nextUp.location || "To be announced"}</dd>
              </div>
              <div>
                <dt>module</dt>
                <dd>{classify(nextUp).label}</dd>
              </div>
            </dl>
            <span className={styles.nextUpAction}>
              Event details
              <ArrowRight size={14} aria-hidden="true" />
            </span>
          </div>
        </Link>
      )}

      {restUpcoming.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Coming up</h2>
          {renderCollection(restUpcoming)}
        </section>
      )}

      {past.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Archive</h2>
          {renderCollection(visiblePast)}

          {/* Load-more */}
          <div className={styles.archiveControls}>
            <p className={styles.archiveCount}>
              <span>
                loaded {visiblePast.length} of {past.length} past events
              </span>
              <span
                className={
                  visiblePast.length >= past.length ? styles.archiveDone : ""
                }
              >
                {archiveProgress}%
              </span>
            </p>
            <div className={styles.archiveTrack}>
              <div
                className={styles.archiveFill}
                style={{ width: `${archiveProgress}%` }}
              />
            </div>
            {visiblePast.length < past.length ? (
              <Link
                href={eventsHref(query, {
                  show: String(visiblePast.length + ARCHIVE_STEP),
                })}
                className={styles.archiveButton}
                scroll={false}
              >
                Load {Math.min(ARCHIVE_STEP, past.length - visiblePast.length)}{" "}
                more
              </Link>
            ) : (
              <p className={styles.archiveComplete}>
                That is the whole archive.
              </p>
            )}
          </div>
        </section>
      )}

      {!failed && events.length === 0 && (
        <EmptyState
          title="Nothing scheduled"
          hint="Stay tuned for upcoming activities."
        />
      )}
    </div>
  );
}
