"use client";

import { useState } from "react";
import { CalendarPlus, Check, Share2 } from "lucide-react";

import styles from "./EventDetail.module.scss";

type Props = {
  slug: string;
  title: string;
  shareText: string;
  completed: boolean;
};

export default function EventActions({
  slug,
  title,
  shareText,
  completed,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/events/${slug}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text: shareText, url });
        return;
      } catch {
        // Cancelled or unavailable
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Nothing more we can offer
    }
  }

  return (
    <div className={styles.actions}>
      {completed ? (
        <button type="button" className={styles.primaryAction} disabled>
          Add to calendar
          <CalendarPlus size={15} aria-hidden="true" />
        </button>
      ) : (
        <a className={styles.primaryAction} href={`/api/events/${slug}/ics`}>
          Add to calendar
          <CalendarPlus size={15} aria-hidden="true" />
        </a>
      )}
      <button type="button" className={styles.secondaryAction} onClick={share}>
        {copied ? "Link copied" : "Share event"}
        {copied ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Share2 size={15} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
