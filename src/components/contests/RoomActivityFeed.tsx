"use client";

import { createElement, useEffect, useState } from "react";
import { Bell, Info, Rss } from "lucide-react";

import { CONTEST_TIMING } from "@/lib/constants";
import type { RoomActivityDto } from "@/lib/contests/dtos";

import { ROOM_ACTIVITY_ICONS } from "./roomActivityIcons";
import { formatRoomActivityTime } from "./roomPresentation";
import styles from "./RoomActivityFeed.module.scss";

const ACTIVITY_COLORS: Record<string, string> = {
  "text-primary": styles.actPrimary,
  "text-error": styles.actError,
  "text-secondary": styles.actSecondary,
};

export default function RoomActivityFeed({
  entries,
  subtitle,
}: {
  entries: RoomActivityDto[];
  subtitle?: string;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [notifGranted, setNotifGranted] = useState(true);

  useEffect(() => {
    setIsMounted(true);
    if (typeof Notification !== "undefined") {
      setNotifGranted(Notification.permission === "granted");
    }
  }, []);

  // Relative timestamps need a repaint every second
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setTick((n) => n + 1),
      CONTEST_TIMING.displayRefreshMs,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.feed}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <Rss size={18} />
          Activity Feed
        </h2>
        {subtitle && <p className={styles.sub}>{subtitle}</p>}
        {isMounted && typeof Notification !== "undefined" && !notifGranted && (
          <button
            className={styles.notifBtn}
            onClick={() =>
              Notification.requestPermission().then((permission) =>
                setNotifGranted(permission === "granted"),
              )
            }
          >
            <Bell size={12} aria-hidden="true" />
            Enable Notifications
          </button>
        )}
      </div>
      <div className={styles.list}>
        {entries.length === 0 ? (
          <p className={styles.empty}>No activity yet.</p>
        ) : (
          [...entries]
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((entry) => (
              <div key={entry.id} className={styles.item}>
                <div className={styles.iconWrap}>
                  {createElement(ROOM_ACTIVITY_ICONS[entry.icon] ?? Info, {
                    className: `${ACTIVITY_COLORS[entry.color] ?? styles.actDefault} ${styles.icon}`,
                    size: 16,
                  })}
                </div>
                <div className={styles.body}>
                  <p
                    className={`${styles.text} ${
                      entry.icon === "gavel" ? styles.textCritical : ""
                    }`}
                  >
                    {entry.text}
                  </p>
                  <span className={styles.time} suppressHydrationWarning>
                    {formatRoomActivityTime(entry.timestamp)}
                  </span>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
