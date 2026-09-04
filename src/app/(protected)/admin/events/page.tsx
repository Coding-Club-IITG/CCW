"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { expectAppData } from "@/lib/api/result";
import { getEventStatus } from "@/lib/eventStatus";
import { APP_TIME_ZONE } from "@/lib/constants";
import type {
  EventPublicationStatus,
  EventRecurrenceType,
} from "@/lib/constants";

import BackLink from "@/components/shared/BackLink";
import Pagination from "@/components/shared/Pagination";
import { TableSkeletonContent } from "@/components/shared/skeletons/TableSkeleton";

import styles from "./AdminEvents.module.scss";

interface EventItem {
  _id: string;
  slug: string;
  title: string;
  startDate: string;
  endDate?: string;
  allDay?: boolean;
  module?: string;
  recurrenceType?: string;
  recurrenceCount?: number;
  status: EventPublicationStatus;
  calendarEventId: string;
}

function formatEventDate(startDate: string, endDate?: string, allDay = true) {
  const formatOptions: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };

  const formattedStart = allDay
    ? new Date(startDate).toLocaleDateString("en-IN", formatOptions)
    : new Intl.DateTimeFormat("en-IN", {
        timeZone: APP_TIME_ZONE,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(startDate));

  if (!endDate) {
    return formattedStart;
  }

  const formattedEnd = allDay
    ? new Date(endDate).toLocaleDateString("en-IN", formatOptions)
    : new Intl.DateTimeFormat("en-IN", {
        timeZone: APP_TIME_ZONE,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(endDate));
  return `${formattedStart} - ${formattedEnd}`;
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [publicationFilter, setPublicationFilter] = useState<
    "" | EventPublicationStatus
  >("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      try {
        setError("");
        const statusQuery = publicationFilter
          ? `&status=${publicationFilter}`
          : "";
        const res = await fetch(
          `/api/admin/events?page=${page}&limit=20${statusQuery}`,
        );
        const data = await expectAppData(res);
        setEvents(data.items || []);
        setTotalPages(data.pagination?.totalPages || 1);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch events.",
        );
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    }

    void fetchEvents();
  }, [page, publicationFilter]);

  return (
    <div>
      <BackLink href="/admin" label="Back to Administration" />

      <div className={styles.header}>
        <div>
          <h1>Public Events</h1>
          <p>Manage club events linked to the calendar.</p>
        </div>
        <Link href="/internal/calendar/new" className={styles.addBtn}>
          Add Calendar Event
        </Link>
      </div>

      <div
        className={styles.publicationFilters}
        aria-label="Publication filters"
      >
        {(["", "draft", "published"] as const).map((value) => (
          <button
            key={value || "all"}
            type="button"
            className={styles.editBtn}
            onClick={() => {
              setPublicationFilter(value);
              setPage(1);
            }}
          >
            {value ? value[0].toUpperCase() + value.slice(1) : "All"}
          </button>
        ))}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <TableSkeletonContent label="events" columns={4} />
      ) : events.length === 0 ? (
        <p className={styles.empty}>No events yet.</p>
      ) : (
        <>
          <div className={styles.list}>
            {events.map((event) => {
              const status = getEventStatus(
                event.startDate,
                event.endDate,
                event.recurrenceType as EventRecurrenceType | undefined,
                event.recurrenceCount,
              );

              return (
                <div key={event._id} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <div className={styles.itemTop}>
                      <span className={styles.itemTitle}>{event.title}</span>
                      <span
                        className={`${styles.statusBadge} ${styles[event.status === "published" ? status.toLowerCase() : "upcoming"]}`}
                      >
                        {event.status === "draft"
                          ? "Draft"
                          : `Published · ${status}`}
                      </span>
                    </div>
                    <span className={styles.itemMeta}>
                      {formatEventDate(
                        event.startDate,
                        event.endDate,
                        event.allDay,
                      )}
                      {event.module ? ` · ${event.module}` : ""}
                    </span>
                  </div>
                  <div className={styles.itemActions}>
                    <Link
                      href={`/admin/events/${event._id}`}
                      className={styles.editBtn}
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/internal/calendar/${event.calendarEventId}`}
                      className={styles.editBtn}
                    >
                      Calendar source
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
