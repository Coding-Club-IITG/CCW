"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import Button from "@/components/shared/Button";
import EmptyState from "@/components/shared/EmptyState";
import InlineNotice from "@/components/shared/InlineNotice";
import Pagination from "@/components/shared/Pagination";
import { TableSkeletonContent } from "@/components/shared/skeletons/TableSkeleton";
import { readAppResult } from "@/lib/api/result";
import { APP_TIME_ZONE } from "@/lib/constants";
import {
  PULSE_QUIZ_STATUSES,
  PULSE_STATUS_LABELS,
  pulseErrorMessage,
  type PulseAppError,
  type PulseQuizStatus,
} from "@/lib/pulse/constants";
import type {
  PulseQuizDetailDto,
  PulseQuizSummaryDto,
} from "@/lib/pulse/quizzes";

import styles from "./AdminPulse.module.scss";

type AdminListResponse = {
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

export default function AdminPulsePage() {
  const [quizzes, setQuizzes] = useState<PulseQuizSummaryDto[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<PulseQuizStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<PulseAppError | null>(null);

  // Form states
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<PulseAppError | null>(null);
  const [successNotice, setSuccessNotice] = useState("");

  const fetchQuizzes = useCallback(
    async (currentPage: number, status: PulseQuizStatus | "") => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(currentPage),
          limit: "15",
        });
        if (status) query.set("status", status);

        const res = await fetch(`/api/admin/pulse?${query.toString()}`);
        const result = await readAppResult<AdminListResponse>(res);

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
          message: "Failed to load quizzes. Please check your connection.",
        });
        setQuizzes([]);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchQuizzes(page, statusFilter);
  }, [fetchQuizzes, page, statusFilter]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !ownerEmail.trim()) return;

    setCreating(true);
    setCreateError(null);
    setSuccessNotice("");

    try {
      const res = await fetch("/api/admin/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          ownerEmail: ownerEmail.trim().toLowerCase(),
        }),
      });

      const result = await readAppResult<PulseQuizDetailDto>(res);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }

      setTitle("");
      setOwnerEmail("");
      setShowCreate(false);
      setSuccessNotice(`Quiz "${result.data.title}" created successfully.`);
      setPage(1);
      void fetchQuizzes(1, statusFilter);
    } catch {
      setCreateError({
        code: "INTERNAL_ERROR",
        message: "Failed to create quiz. Please check your connection.",
      });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={styles.page}>
      <AdminPageHeader
        title="Pulse Quizzes"
        lead="Manage interactive quizzes, schedule sessions, and assign hosts."
        action={
          <Button
            variant="primary"
            onClick={() => {
              setShowCreate((open) => !open);
              setCreateError(null);
            }}
          >
            {showCreate ? "Cancel" : "+ New Quiz"}
          </Button>
        }
      />

      {successNotice && (
        <div className={styles.noticeWrap}>
          <InlineNotice tone="success">{successNotice}</InlineNotice>
        </div>
      )}

      {error && (
        <div className={styles.noticeWrap}>
          <InlineNotice tone="error">{pulseErrorMessage(error)}</InlineNotice>
        </div>
      )}

      {showCreate && (
        <section className={styles.createCard} aria-labelledby="create-heading">
          <h2 id="create-heading" className={styles.createTitle}>
            Create New Pulse Quiz
          </h2>

          {createError && (
            <InlineNotice tone="error">
              {pulseErrorMessage(createError)}
            </InlineNotice>
          )}

          <form className={styles.createForm} onSubmit={handleCreate}>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor="quiz-title-input">Quiz Title *</label>
                <input
                  id="quiz-title-input"
                  type="text"
                  required
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Freshers Coding Quiz 2026"
                  className={styles.input}
                  disabled={creating}
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="owner-email-input">Host / Owner Email *</label>
                <input
                  id="owner-email-input"
                  type="email"
                  required
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder="host@iitg.ac.in"
                  className={styles.input}
                  disabled={creating}
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <Button
                variant="primary"
                type="submit"
                disabled={creating || !title.trim() || !ownerEmail.trim()}
              >
                {creating ? "Creating…" : "Create Quiz"}
              </Button>
              <Button
                variant="ghost"
                type="button"
                disabled={creating}
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      <div className={styles.filters} aria-label="Quiz status filters">
        <button
          type="button"
          className={`${styles.filterChip} ${statusFilter === "" ? styles.active : ""}`}
          onClick={() => {
            setStatusFilter("");
            setPage(1);
          }}
        >
          All
        </button>
        {PULSE_QUIZ_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={`${styles.filterChip} ${statusFilter === status ? styles.active : ""}`}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
          >
            {PULSE_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeletonContent label="pulse quizzes" columns={6} rows={8} />
      ) : quizzes.length === 0 ? (
        <EmptyState
          title="No quizzes found"
          hint={
            statusFilter
              ? "No quizzes match the selected status filter."
              : "No Pulse quizzes have been created yet."
          }
        />
      ) : (
        <>
          <div className={styles.tableFrame}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Room Code</th>
                  <th>Owner</th>
                  <th>Co-hosts</th>
                  <th>Created Date</th>
                  <th className={styles.actionsCell}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((quiz) => (
                  <tr key={quiz.id}>
                    <td>
                      <Link
                        href={`/admin/pulse/${quiz.id}`}
                        className={styles.quizLink}
                      >
                        {quiz.title}
                      </Link>
                    </td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${styles[quiz.status] || ""}`}
                      >
                        {PULSE_STATUS_LABELS[quiz.status] ?? quiz.status}
                      </span>
                    </td>
                    <td>
                      <span className={styles.mono}>{quiz.roomCode}</span>
                    </td>
                    <td>
                      <span className={styles.mono}>
                        {quiz.ownerEmail ?? "—"}
                      </span>
                    </td>
                    <td>{quiz.coHostCount}</td>
                    <td>{formatQuizDate(quiz.createdAt)}</td>
                    <td className={styles.actionsCell}>
                      <Link
                        href={`/admin/pulse/${quiz.id}`}
                        className={styles.editBtn}
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      )}
    </div>
  );
}
