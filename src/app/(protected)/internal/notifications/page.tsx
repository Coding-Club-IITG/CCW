"use client";

import Link from "next/link";
import { ExternalLink as IconExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { expectAppData } from "@/lib/api/result";
import { formatDateTime } from "@/lib/utils";

import Pagination from "@/components/shared/Pagination";
import SearchInput from "@/components/shared/SearchInput";
import { ListSkeletonContent } from "@/components/shared/skeletons/ListSkeleton";

import PushNotificationSetup from "./PushNotificationSetup";
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState("");

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "30",
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/notifications?${params}`);
      const data = await expectAppData(res);
      setNotifications(data.items || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setUnreadCount(data.unreadCount ?? 0);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  async function markAllRead() {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      await expectAppData(response);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  }

  async function clearAllRead() {
    try {
      const response = await fetch("/api/notifications", { method: "DELETE" });
      await expectAppData(response);
      void fetchNotifications();
    } catch {
      // silent
    }
  }

  async function markRead(id: string) {
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      await expectAppData(response);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silent
    }
  }

  function handleSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div>
      <header className={styles.header}>
        <h1>Notifications</h1>
        <p>
          {unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}.`
            : "You're all caught up!"}
        </p>
      </header>

      <PushNotificationSetup />

      <div className={styles.actions}>
        <SearchInput
          placeholder="Search notifications..."
          onSearch={handleSearch}
        />
        {unreadCount > 0 && (
          <button className={styles.btnSecondary} onClick={markAllRead}>
            Mark all as read
          </button>
        )}
        <button className={styles.btnSecondary} onClick={clearAllRead}>
          Clear all read
        </button>
      </div>

      {loading ? (
        <ListSkeletonContent label="notifications" />
      ) : notifications.length === 0 ? (
        <p className={styles.muted}>No notifications yet.</p>
      ) : (
        <>
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
                    {formatDateTime(n.createdAt)}
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
