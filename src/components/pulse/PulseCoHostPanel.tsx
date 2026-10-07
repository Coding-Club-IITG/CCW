"use client";

import { useState } from "react";

import Button from "@/components/shared/Button";
import InlineNotice from "@/components/shared/InlineNotice";
import { useConfirm } from "@/components/shared/useConfirm";
import { readAppResult } from "@/lib/api/result";
import {
  pulseErrorMessage,
  type PulseAppError,
} from "@/lib/pulse/constants";
import type {
  PulseHostDto,
  PulseQuizDetailDto,
} from "@/lib/pulse/quizzes";

import styles from "./PulseCoHostPanel.module.scss";

export interface PulseCoHostPanelProps {
  quizId: string;
  initialCoHosts: PulseHostDto[];
  accessRole: "owner" | "cohost" | "admin";
  apiBase: "/api/pulse/host" | "/api/admin/pulse";
}

export default function PulseCoHostPanel({
  quizId,
  initialCoHosts,
  accessRole,
  apiBase,
}: PulseCoHostPanelProps) {
  const [coHosts, setCoHosts] = useState<PulseHostDto[]>(initialCoHosts);
  const [emailInput, setEmailInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [error, setError] = useState<PulseAppError | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  const { confirm, confirmDialog } = useConfirm();
  const canRemove = accessRole === "owner" || accessRole === "admin";

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!email) return;

    setSubmitting(true);
    setError(null);
    setSuccessMsg("");

    try {
      const res = await fetch(`${apiBase}/${encodeURIComponent(quizId)}/cohosts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const result = await readAppResult<PulseQuizDetailDto>(res);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCoHosts(result.data.coHosts);
      setEmailInput("");
      setSuccessMsg(`Co-host "${email}" added.`);
    } catch {
      setError({
        code: "INTERNAL_ERROR",
        message: "Failed to add co-host. Please check your connection.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(email: string) {
    const ok = await confirm({
      title: "Remove co-host?",
      description: `Are you sure you want to remove ${email} from this quiz?`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    setRemovingEmail(email);
    setError(null);
    setSuccessMsg("");

    try {
      const res = await fetch(`${apiBase}/${encodeURIComponent(quizId)}/cohosts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const result = await readAppResult<PulseQuizDetailDto>(res);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setCoHosts(result.data.coHosts);
      setSuccessMsg(`Co-host "${email}" removed.`);
    } catch {
      setError({
        code: "INTERNAL_ERROR",
        message: "Failed to remove co-host. Please check your connection.",
      });
    } finally {
      setRemovingEmail(null);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.headingBlock}>
        <h3 className={styles.title}>Co-hosts</h3>
        <p className={styles.subtitle}>
          Co-hosts can manage quiz questions and conduct live sessions.
        </p>
      </div>

      {error && (
        <div className={styles.noticeWrap}>
          <InlineNotice tone="error">{pulseErrorMessage(error)}</InlineNotice>
        </div>
      )}

      {successMsg && (
        <div className={styles.noticeWrap}>
          <InlineNotice tone="success">{successMsg}</InlineNotice>
        </div>
      )}

      <form className={styles.addForm} onSubmit={handleAdd}>
        <div className={styles.field}>
          <label htmlFor="cohost-email-input">Add Co-host by Email</label>
          <input
            id="cohost-email-input"
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="colleague@iitg.ac.in"
            required
            className={styles.input}
            disabled={submitting}
          />
        </div>
        <Button
          variant="secondary"
          size="small"
          type="submit"
          disabled={submitting || !emailInput.trim()}
        >
          {submitting ? "Adding…" : "Add Co-host"}
        </Button>
      </form>

      <div className={styles.list}>
        {coHosts.length === 0 ? (
          <p className={styles.emptyText}>No co-hosts assigned to this quiz.</p>
        ) : (
          coHosts.map((host) => {
            const isRemoving = removingEmail === host.email;
            const isLinked = Boolean(host.linkedAt);

            return (
              <div key={host.email ?? ""} className={styles.item}>
                <div className={styles.itemInfo}>
                  <span className={styles.email}>{host.email}</span>
                  <span
                    className={
                      isLinked ? styles.statusLinked : styles.statusPending
                    }
                  >
                    {isLinked ? "Linked" : "Pending first sign-in"}
                  </span>
                </div>

                {canRemove && host.email && (
                  <Button
                    variant="danger"
                    size="small"
                    disabled={isRemoving || submitting}
                    onClick={() => void handleRemove(host.email!)}
                  >
                    {isRemoving ? "Removing…" : "Remove"}
                  </Button>
                )}
              </div>
            );
          })
        )}
      </div>

      {confirmDialog}
    </div>
  );
}
