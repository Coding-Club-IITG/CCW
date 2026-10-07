"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import PulseSignInPrompt from "@/components/pulse/PulseSignInPrompt";
import EmptyState from "@/components/shared/EmptyState";
import InlineNotice from "@/components/shared/InlineNotice";
import Pagination from "@/components/shared/Pagination";
import { ListSkeletonContent } from "@/components/shared/skeletons/ListSkeleton";
import { readAppResult } from "@/lib/api/result";
import {
  PULSE_STATUS_LABELS,
  pulseErrorMessage,
  type PulseAppError,
} from "@/lib/pulse/constants";
import type { PulseQuizSummaryDto } from "@/lib/pulse/quizzes";

import styles from "@/app/(public)/pulse/host/PulseHost.module.scss";

type HostListResponse = {
  items: PulseQuizSummaryDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export default function PulseHostList() {
  const [quizzes, setQuizzes] = useState<PulseQuizSummaryDto[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PulseAppError | null>(null);

  const fetchQuizzes = useCallback(async (currentPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pulse/host?page=${currentPage}&limit=10`);
      const result = await readAppResult<HostListResponse>(res);

      if (!result.ok) {
        setError(result.error);
        setQuizzes([]);
        setTotalPages(1);
        return;
      }

      setQuizzes(result.data.items);
      setTotalPages(result.data.pagination.totalPages || 1);
    } catch {
      setError({
        code: "INTERNAL_ERROR",
        message: "Failed to connect to the server.",
      });
      setQuizzes([]);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQuizzes(page);
  }, [fetchQuizzes, page]);

  if (loading) {
    return (
      <div className={styles.skeletonWrap}>
        <ListSkeletonContent rows={5} label="host quizzes" />
      </div>
    );
  }

  // Session expired or invalid
  if (error?.code === "PULSE_NOT_AUTHORIZED") {
    return (
      <div className={styles.authNotice}>
        <PulseSignInPrompt callbackURL="/pulse/host" />
      </div>
    );
  }

  // Logged-in non-Microsoft session or other specific error
  if (error) {
    const isNotHost = error.code === "PULSE_NOT_HOST";
    return (
      <div className={styles.authNotice}>
        <InlineNotice tone="info">
          {isNotHost ? error.message : pulseErrorMessage(error)}
        </InlineNotice>
      </div>
    );
  }

  // No quizzes assigned
  if (quizzes.length === 0) {
    return (
      <div className={styles.authNotice}>
        <EmptyState
          title="No Pulse quizzes assigned"
          hint="You do not have any active owner or co-host quiz assignments yet."
        />
      </div>
    );
  }

  return (
    <>
      <div className={styles.list}>
        {quizzes.map((quiz) => {
          const statusLabel = PULSE_STATUS_LABELS[quiz.status] ?? quiz.status;
          const isOwner = quiz.role === "owner";

          return (
            <Link
              key={quiz.id}
              href={`/pulse/host/${quiz.id}`}
              className={styles.card}
            >
              <div className={styles.cardInfo}>
                <h2 className={styles.cardTitle}>{quiz.title}</h2>
                <div className={styles.cardMeta}>
                  <span>
                    Room code:{" "}
                    <strong className={styles.roomCode}>{quiz.roomCode}</strong>
                  </span>
                  <span>Co-hosts: {quiz.coHostCount}</span>
                </div>
              </div>

              <div className={styles.badgeGroup}>
                <span
                  className={`${styles.statusBadge} ${styles[quiz.status] || ""}`}
                >
                  {statusLabel}
                </span>
                <span
                  className={isOwner ? styles.roleBadge : styles.cohostRole}
                >
                  {quiz.role === "owner" ? "Owner" : "Co-host"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationWrap}>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </>
  );
}
