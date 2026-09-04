"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCalendarEvent } from "@/lib/actions/calendar";

import { useConfirm } from "@/components/shared/useConfirm";

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
  const { confirm, confirmDialog } = useConfirm();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    const confirmed = await confirm({
      title: publicEventId
        ? "Delete the calendar and public event?"
        : "Delete this calendar event?",
      description: publicEventId
        ? "This permanently removes the calendar entry and the public event linked to it."
        : "This permanently removes the calendar entry, including its agenda, minutes and reminders.",
      confirmLabel: "Delete event",
    });
    if (!confirmed) return;
    setDeleting(true);
    const result = await deleteCalendarEvent(id);
    if (!result.ok) {
      setError(result.error.message);
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
      {confirmDialog}
    </div>
  );
}
