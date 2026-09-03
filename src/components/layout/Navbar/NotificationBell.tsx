"use client";

import { expectAppData } from "@/lib/api/result";
import { clientEnv } from "@/lib/env/client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Bell as IconBell,
  ExternalLink as IconExternalLink,
} from "lucide-react";
import styles from "./NotificationBell.module.scss";

const NOTIFICATION_POLL_INTERVAL_MS = 30_000;

interface Notification {
  _id: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isFetchingRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const res = await fetch("/api/notifications?unread=true");
      const data = await expectAppData(res);
      setUnreadCount(data.unreadCount || 0);
      setNotifications((data.items || []).slice(0, 5));
    } catch {
      // silent
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (clientEnv.DISABLE_NOTIFICATION_POLLING) return;

    let intervalId: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(
        fetchNotifications,
        NOTIFICATION_POLL_INTERVAL_MS,
      );
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchNotifications();
        startPolling();
      } else {
        stopPolling();
      }
    };

    if (document.visibilityState === "visible") {
      fetchNotifications();
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function markRead(id: string) {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      await expectAppData(response);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silent
    }
  }

  return (
    <div className={styles.wrapper} ref={ref}>
      <button
        className={styles.bell}
        onClick={() => setOpen(!open)}
        aria-label="Notifications"
        type="button"
      >
        <IconBell width={18} height={18} />
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && <span className={styles.arrow} aria-hidden="true" />}

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <span>Notifications</span>
            <Link
              href="/internal/notifications"
              className={styles.viewAll}
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>
          {notifications.length === 0 ? (
            <p className={styles.empty}>No new notifications</p>
          ) : (
            <div className={styles.list}>
              {notifications.map((n) => (
                <div
                  key={n._id}
                  className={styles.item}
                  onClick={() => markRead(n._id)}
                >
                  <span className={styles.itemTitle}>{n.title}</span>
                  <span className={styles.itemMsg}>{n.message}</span>
                  {n.link && (
                    <Link
                      href={n.link}
                      className={styles.itemLink}
                      onClick={() => setOpen(false)}
                    >
                      View <IconExternalLink width={12} height={12} />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
