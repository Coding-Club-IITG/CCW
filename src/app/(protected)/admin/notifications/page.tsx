"use client";

import { useState } from "react";
import BackLink from "@/components/shared/BackLink";
import { Send as IconSend } from "lucide-react";
import { MODULES } from "@/lib/constants";
import styles from "./Notifications.module.scss";

export default function AdminNotificationsPage() {
  const [target, setTarget] = useState("all");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    sent?: number;
    error?: string;
  } | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          title,
          message,
          link: link || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error || "Failed to send." });
      } else {
        setResult({ success: true, sent: data.sent });
        setTitle("");
        setMessage("");
        setLink("");
      }
    } catch {
      setResult({ error: "Failed to send notification." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={styles.container}>
      <BackLink href="/admin" label="Back to Administration" />

      <header className={styles.header}>
        <h1>Send Notifications</h1>
        <p>Broadcast announcements to all members or specific modules.</p>
      </header>

      <form className={styles.form} onSubmit={handleSend}>
        <div className={styles.field}>
          <label>Target Audience</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={styles.select}
          >
            <option value="all">All Members</option>
            {MODULES.map((m) => (
              <option key={m} value={`module:${m}`}>
                {m} Module
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label>Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notification title"
            maxLength={200}
            required
          />
        </div>

        <div className={styles.field}>
          <label>Message *</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Notification message..."
            rows={4}
            maxLength={1000}
            required
          />
        </div>

        <div className={styles.field}>
          <label>Link (optional)</label>
          <input
            type="text"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/internal/dashboard or https://..."
          />
        </div>

        <button type="submit" className={styles.btnPrimary} disabled={sending}>
          <IconSend width={14} height={14} />
          {sending ? "Sending..." : "Send Notification"}
        </button>
      </form>

      {result && (
        <div className={result.success ? styles.success : styles.error}>
          {result.success
            ? `Notification sent to ${result.sent} user${result.sent !== 1 ? "s" : ""}.`
            : result.error}
        </div>
      )}
    </div>
  );
}
