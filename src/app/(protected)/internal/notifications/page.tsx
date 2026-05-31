"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IconExternalLink } from "@/components/shared/Icons";
import styles from "./Notifications.module.scss";

interface Notification {
  _id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
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
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n)),
      );
    } catch {
      // silent
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Notifications</h1>
        <p>
          {unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}.`
            : "You're all caught up!"}
        </p>
      </header>

      {unreadCount > 0 && (
        <button className={styles.btnSecondary} onClick={markAllRead}>
          Mark all as read
        </button>
      )}

      {loading ? (
        <p className={styles.muted}>Loading...</p>
      ) : notifications.length === 0 ? (
        <p className={styles.muted}>No notifications yet.</p>
      ) : (
        <div className={styles.list}>
          {notifications.map((n) => (
            <div
              key={n._id}
              className={`${styles.item} ${!n.read ? styles.unread : ""}`}
              onClick={() => !n.read && markRead(n._id)}
            >
              <div className={styles.itemContent}>
                <h3>{n.title}</h3>
                <p>{n.message}</p>
                <span className={styles.time}>
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              {n.link && (
                <Link href={n.link} className={styles.itemLink}>
                  View <IconExternalLink width={12} height={12} />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
