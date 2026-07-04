"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { IconBell, IconExternalLink } from "@/components/shared/Icons";
import styles from "./NotificationBell.module.scss";

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

  useEffect(() => {
    fetchNotifications();
    
    if (process.env.NEXT_PUBLIC_DISABLE_NOTIFICATION_POLLING === "true") {
      return;
    }
    
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

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

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications?unread=true");
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(data.unreadCount || 0);
      setNotifications((data.items || []).slice(0, 5));
    } catch {
      // silent
    }
  }

  async function markRead(id: string) {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
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
