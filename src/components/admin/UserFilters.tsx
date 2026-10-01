"use client";

import { useEffect, useState } from "react";
import {
  ACCESS_LEVELS,
  AUTH_PROVIDERS,
  AUTH_PROVIDER_LABELS,
  CLUB_POSITIONS,
  MODULE_POSITIONS,
  MODULES,
  USER_SORT_FIELDS,
  USER_SORT_LABELS,
} from "@/lib/constants";
import {
  DEFAULT_USER_QUERY,
  userQuerySchema,
  type UserQuery,
} from "@/lib/userQuery";
import Button from "@/components/shared/Button";
import styles from "./UserManagement.module.scss";

export default function UserFilters({
  query,
  onApply,
}: {
  query: UserQuery;
  onApply: (query: UserQuery) => void;
}) {
  const [draft, setDraft] = useState(query);
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(query);
  }, [query]);
  const set = (key: keyof UserQuery, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  function select(
    key: keyof UserQuery,
    label: string,
    values: readonly string[],
    unassigned = true,
  ) {
    return (
      <div className={styles.field}>
        <label htmlFor={`member-filter-${key}`}>{label}</label>
        <select
          id={`member-filter-${key}`}
          value={String(draft[key] ?? "")}
          onChange={(event) => set(key, event.target.value)}
        >
          <option value="">All</option>
          {unassigned && <option value="unassigned">Unassigned</option>}
          {values.map((value) => (
            <option key={value} value={value}>
              {key === "provider"
                ? AUTH_PROVIDER_LABELS[
                    value as keyof typeof AUTH_PROVIDER_LABELS
                  ]
                : value}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <details className={styles.filters}>
      <summary>Filters and sorting</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const result = userQuerySchema.safeParse({
            ...draft,
            q: query.q,
            page: 1,
          });
          if (!result.success) {
            setError("Check the tenure and pizza count range.");
            return;
          }
          setError("");
          onApply(result.data);
        }}
      >
        <div className={styles.filterGrid}>
          <div className={styles.field}>
            <label htmlFor="member-filter-scope">Search in</label>
            <select
              id="member-filter-scope"
              value={draft.scope}
              onChange={(event) => set("scope", event.target.value)}
            >
              <option value="all">Name and email</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
            </select>
          </div>
          {select("access", "Access", ACCESS_LEVELS)}
          <div className={styles.field}>
            <label htmlFor="member-filter-tenure">Tenure</label>
            <input
              id="member-filter-tenure"
              value={draft.tenure === "unassigned" ? "" : draft.tenure}
              disabled={draft.tenure === "unassigned"}
              placeholder="YYYY-YY"
              onChange={(event) => set("tenure", event.target.value)}
            />
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                aria-label="Unassigned tenure"
                checked={draft.tenure === "unassigned"}
                onChange={(event) =>
                  set("tenure", event.target.checked ? "unassigned" : "")
                }
              />
              Unassigned
            </label>
          </div>
          {select("position", "Position", [
            ...CLUB_POSITIONS,
            ...MODULE_POSITIONS,
          ])}
          {select("roleModule", "Role module", MODULES)}
          {select("managedModule", "Managed module", MODULES)}
          {select("provider", "Sign-in method", AUTH_PROVIDERS)}
          <div className={styles.field}>
            <label htmlFor="member-filter-minPizza">Minimum pizza count</label>
            <input
              id="member-filter-minPizza"
              type="number"
              min="0"
              max="1000000"
              value={draft.minPizza ?? ""}
              onChange={(event) => set("minPizza", event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="member-filter-maxPizza">Maximum pizza count</label>
            <input
              id="member-filter-maxPizza"
              type="number"
              min="0"
              max="1000000"
              value={draft.maxPizza ?? ""}
              onChange={(event) => set("maxPizza", event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="member-filter-sort">Sort by</label>
            <select
              id="member-filter-sort"
              value={draft.sort}
              onChange={(event) => set("sort", event.target.value)}
            >
              {USER_SORT_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {USER_SORT_LABELS[field]}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="member-filter-direction">Direction</label>
            <select
              id="member-filter-direction"
              value={draft.direction}
              onChange={(event) => set("direction", event.target.value)}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className={styles.filterActions}>
          <Button type="submit" variant="primary" size="small">
            Apply
          </Button>
          <Button
            size="small"
            onClick={() => {
              setDraft(DEFAULT_USER_QUERY);
              setError("");
              onApply(DEFAULT_USER_QUERY);
            }}
          >
            Clear
          </Button>
        </div>
      </form>
    </details>
  );
}
