"use client";

import { use, useCallback, useEffect, useState } from "react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import PulseCoHostPanel from "@/components/pulse/PulseCoHostPanel";
import Button from "@/components/shared/Button";
import EmptyState from "@/components/shared/EmptyState";
import InlineNotice from "@/components/shared/InlineNotice";
import { CardGridSkeletonContent } from "@/components/shared/skeletons/CardGridSkeleton";
import { readAppResult } from "@/lib/api/result";
import { APP_TIME_ZONE } from "@/lib/constants";
import {
  PULSE_STATUS_LABELS,
  pulseErrorMessage,
  type PulseAppError,
} from "@/lib/pulse/constants";
import type { PulseQuizDetailDto } from "@/lib/pulse/quizzes";

import styles from "./AdminPulseQuiz.module.scss";

function formatQuizDate(dateString: string) {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: APP_TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dateString));
  } catch {
    return dateString;
  }
}

export default function AdminPulseQuizPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = use(params);

  const [quiz, setQuiz] = useState<PulseQuizDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PulseAppError | null>(null);

  const fetchQuiz = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pulse/${encodeURIComponent(quizId)}`);
      const result = await readAppResult<PulseQuizDetailDto>(res);

      if (!result.ok) {
        setError(result.error);
        setQuiz(null);
        return;
      }

      setQuiz(result.data);
    } catch {
      setError({
        code: "INTERNAL_ERROR",
        message: "Failed to load quiz details. Please check your connection.",
      });
      setQuiz(null);
    } finally {
      setLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    void fetchQuiz();
  }, [fetchQuiz]);

  if (loading) {
    return (
      <div className={styles.page}>
        <AdminPageHeader
          title="Quiz Management"
          lead="Loading quiz details…"
        />
        <CardGridSkeletonContent cards={3} label="quiz details" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className={styles.page}>
        <AdminPageHeader
          title="Quiz Management"
          lead="Pulse Quiz Details"
        />
        <div className={styles.noticeWrap}>
          {error ? (
            <InlineNotice tone="error">{pulseErrorMessage(error)}</InlineNotice>
          ) : (
            <EmptyState
              title="Quiz Not Found"
              hint="The requested Pulse quiz could not be located."
            />
          )}
        </div>
      </div>
    );
  }

  const statusLabel = PULSE_STATUS_LABELS[quiz.status] ?? quiz.status;
  const isOwnerLinked = Boolean(quiz.owner.linkedAt);

  return (
    <div className={styles.page}>
      <AdminPageHeader
        title={quiz.title}
        lead="Manage quiz settings, assigned hosts, and lifecycle status."
      />

      <div className={styles.cardGrid}>
        <section className={styles.card} aria-labelledby="overview-heading">
          <h2 id="overview-heading" className={styles.cardHeading}>
            Quiz Information
          </h2>
          <dl className={styles.detailList}>
            <dt>Room Code</dt>
            <dd>
              <strong className={styles.mono}>{quiz.roomCode}</strong>
            </dd>

            <dt>Status</dt>
            <dd>
              <span
                className={`${styles.statusBadge} ${styles[quiz.status] || ""}`}
              >
                {statusLabel}
              </span>
            </dd>

            <dt>Created Date</dt>
            <dd>{formatQuizDate(quiz.createdAt)}</dd>
          </dl>
        </section>

        <section className={styles.card} aria-labelledby="owner-heading">
          <h2 id="owner-heading" className={styles.cardHeading}>
            Owner Assignment
          </h2>
          <dl className={styles.detailList}>
            <dt>Host Email</dt>
            <dd className={styles.mono}>
              {quiz.owner.email ?? "Not assigned"}
            </dd>

            <dt>Account Link</dt>
            <dd>
              <span
                className={
                  isOwnerLinked
                    ? styles.ownerStatusLinked
                    : styles.ownerStatusPending
                }
              >
                {isOwnerLinked ? "Linked" : "Pending first sign-in"}
              </span>
            </dd>

            <dt>Assignment Type</dt>
            <dd>Permanent Owner (Not removable)</dd>
          </dl>
        </section>
      </div>

      <PulseCoHostPanel
        quizId={quiz.id}
        initialCoHosts={quiz.coHosts}
        accessRole="admin"
        apiBase="/api/admin/pulse"
      />

      <section className={styles.actionsCard} aria-labelledby="actions-heading">
        <h2 id="actions-heading" className={styles.actionsHeading}>
          Lifecycle Actions
        </h2>
        <p className={styles.actionsLead}>
          Quiz archive, delete, and termination actions will be available in a
          future release.
        </p>
        <div className={styles.buttonRow}>
          <Button variant="secondary" disabled aria-disabled="true">
            Archive Quiz
          </Button>
          <Button variant="secondary" disabled aria-disabled="true">
            Terminate Session
          </Button>
          <Button variant="danger" disabled aria-disabled="true">
            Delete Quiz
          </Button>
        </div>
      </section>
    </div>
  );
}
