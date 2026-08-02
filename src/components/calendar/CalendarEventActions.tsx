"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCalendarEvent } from "@/lib/actions/calendar";
import styles from "@/app/(protected)/internal/calendar/Calendar.module.scss";

export default function CalendarEventActions({
  id,
  publicEventId,
  canManage,
  canPublish,
}: {
  id: string;
  publicEventId?: string;
  canManage: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    const message = publicEventId
      ? "This permanently deletes both the calendar entry and its public event. Continue?"
      : "Delete this calendar event?";
    if (!window.confirm(message)) return;
    setDeleting(true);
    const result = await deleteCalendarEvent(id);
    if (!result.success) {
      setError(result.error);
      setDeleting(false);
      return;
    }
    router.push("/internal/calendar");
    router.refresh();
  }
  return (
    <div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        {canManage && (
          <Link
            className={styles.secondaryAction}
            href={`/internal/calendar/${id}/edit`}
          >
            Edit calendar event
          </Link>
        )}
        {canPublish &&
          (publicEventId ? (
            <Link
              className={styles.secondaryAction}
              href={`/admin/events/${publicEventId}`}
            >
              Manage public event
            </Link>
          ) : (
            <Link
              className={styles.primaryAction}
              href={`/admin/events/new?calendarEventId=${id}`}
            >
              Create public event
            </Link>
          ))}
        {canManage && (
          <button
            className={styles.dangerAction}
            type="button"
            onClick={() => void remove()}
            disabled={deleting}
          >
            {deleting
              ? "Deleting…"
              : publicEventId
                ? "Delete calendar and public event"
                : "Delete event"}
          </button>
        )}
      </div>
    </div>
  );
}
