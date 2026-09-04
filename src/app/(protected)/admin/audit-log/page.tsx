"use client";

import { FormEvent, useEffect, useState } from "react";

import type { AuditLogDto, AuditSummaryValue } from "@/lib/audit/types";
import { expectAppData } from "@/lib/api/result";
import { AUDIT_ACTIONS, AUDIT_CATEGORIES } from "@/lib/constants";
import BackLink from "@/components/shared/BackLink";
import Pagination from "@/components/shared/Pagination";
import { ListSkeletonContent } from "@/components/shared/skeletons/ListSkeleton";

import styles from "./AuditLog.module.scss";

type Response = {
  items: AuditLogDto[];
  pagination: { page: number; total: number; totalPages: number };
};

function display(value: AuditSummaryValue | undefined) {
  if (value === undefined) return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function eventVerb(event: AuditLogDto) {
  if (Object.keys(event.before).length === 0) return "created";
  if (Object.keys(event.after).length === 0) return "deleted";
  return "changed";
}

function Changes({ event }: { event: AuditLogDto }) {
  const keys = [
    ...new Set([...Object.keys(event.before), ...Object.keys(event.after)]),
  ].filter(
    (key) =>
      JSON.stringify(event.before[key]) !== JSON.stringify(event.after[key]),
  );
  const changeLabel =
    Object.keys(event.before).length === 0
      ? "Created"
      : Object.keys(event.after).length === 0
        ? "Deleted"
        : `${keys.length} changed field${keys.length === 1 ? "" : "s"}`;
  return (
    <details className={styles.changes}>
      <summary>{changeLabel}</summary>
      {keys.length === 0 ? (
        <p>No field summary.</p>
      ) : (
        <dl>
          {keys.map((key) => (
            <div key={key}>
              <dt>{key.replace(/([A-Z_])/g, " $1").trim()}</dt>
              <dd>
                <span>{display(event.before[key])}</span>
                <b aria-label="changed to">→</b>
                <span>{display(event.after[key])}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  );
}

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditLogDto[]>([]);
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    action: "",
    resourceType: "",
    from: "",
    to: "",
  });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), limit: "25" });
      if (applied.search) params.set("actor", applied.search);
      if (applied.category) params.set("category", applied.category);
      if (applied.action) params.set("action", applied.action);
      if (applied.resourceType)
        params.set("resourceType", applied.resourceType);
      if (applied.from)
        params.set(
          "from",
          new Date(`${applied.from}T00:00:00+05:30`).toISOString(),
        );
      if (applied.to)
        params.set(
          "to",
          new Date(`${applied.to}T23:59:59.999+05:30`).toISOString(),
        );
      try {
        const response = await fetch(`/api/admin/audit-log?${params}`, {
          signal: controller.signal,
        });
        const data = await expectAppData<Response>(response);
        setEvents(data.items);
        setTotal(data.pagination.total);
        setTotalPages(data.pagination.totalPages || 1);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load the audit log.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [applied, page]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setApplied(filters);
  }

  return (
    <main>
      <BackLink href="/admin" label="Back to Administration" />
      <header>
        <h1>Audit Log</h1>
        <p>Privileged changes from the last six months.</p>
      </header>
      <form className={styles.filters} onSubmit={submit}>
        <label>
          Actor or target
          <input
            value={filters.search}
            maxLength={160}
            placeholder="Name or safe target label"
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </label>
        <label>
          Category
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters({ ...filters, category: e.target.value })
            }
          >
            <option value="">All</option>
            {AUDIT_CATEGORIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Action
          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
          >
            <option value="">All</option>
            {AUDIT_ACTIONS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Resource type
          <input
            value={filters.resourceType}
            maxLength={64}
            onChange={(e) =>
              setFilters({ ...filters, resourceType: e.target.value })
            }
          />
        </label>
        <label>
          From
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
        <button type="submit">Apply filters</button>
      </form>
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : loading ? (
        <ListSkeletonContent label="audit history" />
      ) : events.length === 0 ? (
        <p className={styles.state} aria-live="polite">
          No audit events match these filters.
        </p>
      ) : (
        <>
          <p className={styles.count}>
            {total} event{total === 1 ? "" : "s"}
          </p>
          <div className={styles.list}>
            {events.map((event) => (
              <article className={styles.card} key={event.id}>
                <div className={styles.cardTop}>
                  <div>
                    <strong>{event.operation.replaceAll(/[._]/g, " ")}</strong>
                    <span>
                      {event.category} · {event.action}
                    </span>
                  </div>
                  <time dateTime={event.createdAt}>
                    {new Date(event.createdAt).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    IST
                  </time>
                </div>
                <p>
                  <b>{event.actor.displayName}</b> ({event.actor.access})
                  <span className={styles.verb}>{eventVerb(event)}</span>
                  <b>{event.target.label}</b>{" "}
                  <span className={styles.type}>{event.target.type}</span>
                </p>
                <Changes event={event} />
              </article>
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
    </main>
  );
}
