"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BackLink from "@/components/shared/BackLink";
import Pagination from "@/components/shared/Pagination";
import { deleteEvent } from "@/lib/actions/admin/events";
import { getEventStatus } from "@/lib/eventStatus";
import type { EventRecurrenceType } from "@/lib/constants";
import styles from "./AdminEvents.module.scss";

interface EventItem {
  _id: string;
  title: string;
  startDate: string;
  endDate?: string;
  module?: string;
  recurrenceType?: string;
  recurrenceCount?: number;
}

function formatEventDate(startDate: string, endDate?: string) {
  const formatOptions: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };

  const formattedStart = new Date(startDate).toLocaleDateString(
    "en-IN",
    formatOptions,
  );

  if (!endDate) {
    return formattedStart;
  }

  const formattedEnd = new Date(endDate).toLocaleDateString(
    "en-IN",
    formatOptions,
  );
  return `${formattedStart} - ${formattedEnd}`;
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true);
      try {
        setError("");
        const res = await fetch(`/api/admin/events?page=${page}&limit=20`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch events.");
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
  }, [page]);

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this event?")) {
      return;
    }

    setDeleting(id);
    setError("");

    const result = await deleteEvent(id);
    if (result.success) {
      setEvents((prev) => prev.filter((event) => event._id !== id));
    } else {
      setError(result.error || "Failed to delete event.");
    }

    setDeleting(null);
  }

  return (
    <div className={styles.container}>
      <BackLink href="/admin" label="Back to Administration" />

      <div className={styles.header}>
        <div>
          <h1>Event Management</h1>
          <p>Create, edit, and organize club events.</p>
        </div>
        <Link href="/admin/events/new" className={styles.addBtn}>
          Add Event
        </Link>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <p className={styles.loading}>Loading events...</p>
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
                        className={`${styles.statusBadge} ${styles[status.toLowerCase()]}`}
                      >
                        {status}
                      </span>
                    </div>
                    <span className={styles.itemMeta}>
                      {formatEventDate(event.startDate, event.endDate)}
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
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => void handleDelete(event._id)}
                      disabled={deleting === event._id}
                    >
                      {deleting === event._id ? "Deleting..." : "Delete"}
                    </button>
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
