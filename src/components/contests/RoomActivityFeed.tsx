"use client";

import { createElement, useEffect, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Gavel,
  Info,
  Lock,
  RefreshCw,
  Rss,
  User,
  UserX,
  type LucideIcon,
} from "lucide-react";

import type { RoomActivityDto } from "@/lib/contests/dtos";

import { formatRoomActivityTime } from "./roomPresentation";
import styles from "./RoomActivityFeed.module.scss";

const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  info: Info,
  gavel: Gavel,
  lock: Lock,
  sync: RefreshCw,
  check_circle: CircleCheck,
  error: CircleAlert,
  person: User,
  person_off: UserX,
};

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
  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== "undefined" &&
      Notification.permission === "granted",
  );

  // Relative timestamps need a repaint every second
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
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
        {typeof Notification !== "undefined" && !notifGranted && (
          <button
            className={styles.notifBtn}
            onClick={() =>
              Notification.requestPermission().then((permission) =>
                setNotifGranted(permission === "granted"),
              )
            }
          >
            🔔 Enable Notifications
          </button>
        )}
      </div>
      <div className={styles.list}>
        {entries.length === 0 ? (
          <p className={styles.empty}>No activity yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={styles.item}>
              <div className={styles.iconWrap}>
                {createElement(ACTIVITY_ICONS[entry.icon] ?? Info, {
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
                <span className={styles.time}>
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
