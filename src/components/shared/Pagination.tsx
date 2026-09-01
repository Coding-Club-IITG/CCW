"use client";

import Link from "next/link";
import { useCallback, useEffect } from "react";

import styles from "./Pagination.module.scss";

type PaginationProps = {
  page: number;
  totalPages: number;
  /** Callback form: used by pages that paginate client-side */
  onPageChange?: (page: number) => void;
  /** Link form: renders every slot as a real anchor so pages are shareable and crawlable */
  hrefBase?: string;
  /** Filters to carry through each page link, Eg. { tag: "Tutorial" }. */
  hrefParams?: Record<string, string>;
  /** Query key holding the page number */
  pageParam?: string;
  /** Enables the left/right/Home/End shortcuts (for Link form only) */
  keyboard?: boolean;
  /** Range summary shown to the left of the control, Eg. "showing 1-8 of 24". */
  rangeLabel?: string;
  maxVisible?: number;
  ariaLabel?: string;
};

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  hrefBase,
  hrefParams,
  pageParam = "page",
  keyboard = false,
  rangeLabel,
  maxVisible = 5,
  ariaLabel = "Pagination",
}: PaginationProps) {
  const linked = Boolean(hrefBase);

  const hrefFor = useCallback(
    (target: number) => {
      const params = new URLSearchParams(hrefParams ?? {});
      if (target > 1) params.set(pageParam, String(target));
      const query = params.toString();
      return query ? `${hrefBase}?${query}` : (hrefBase ?? "");
    },
    [hrefBase, hrefParams, pageParam],
  );

  useEffect(() => {
    if (!keyboard || !linked) return;

    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      ) {
        return;
      }

      let next: number | null = null;
      if (event.key === "ArrowLeft" && page > 1) next = page - 1;
      else if (event.key === "ArrowRight" && page < totalPages) next = page + 1;
      else if (event.key === "Home" && page !== 1) next = 1;
      else if (event.key === "End" && page !== totalPages) next = totalPages;
      if (next === null) return;

      event.preventDefault();
      window.location.assign(hrefFor(next));
    };

    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [keyboard, linked, hrefFor, page, totalPages]);

  if (totalPages <= 1) return null;

  const pages = getVisiblePages(page, totalPages, maxVisible);

  // Disabled ends stay in place rather than vanishing,
  // so the control does not shift under the cursor on the first or last page.
  function step(direction: -1 | 1, label: string, disabled: boolean) {
    const target = page + direction;
    const content = direction === -1 ? `← ${label}` : `${label} →`;
    if (disabled) {
      return (
        <span
          className={`${styles.step} ${styles.disabled}`}
          aria-hidden="true"
        >
          {content}
        </span>
      );
    }
    return linked ? (
      <Link
        className={styles.step}
        href={hrefFor(target)}
        rel={direction === -1 ? "prev" : "next"}
      >
        {content}
      </Link>
    ) : (
      <button
        type="button"
        className={styles.step}
        onClick={() => onPageChange?.(target)}
      >
        {content}
      </button>
    );
  }

  return (
    <nav className={styles.wrapper} aria-label={ariaLabel}>
      {rangeLabel && <p className={styles.range}>{rangeLabel}</p>}

      <div className={styles.pagination}>
        {step(-1, "prev", page <= 1)}

        {pages.map((slot, index) =>
          slot === "..." ? (
            <span key={`ellipsis-${index}`} className={styles.ellipsis}>
              …
            </span>
          ) : linked ? (
            <Link
              key={slot}
              href={hrefFor(slot)}
              className={`${styles.pageBtn} ${slot === page ? styles.active : ""}`}
              aria-current={slot === page ? "page" : undefined}
              aria-label={`Page ${slot}`}
            >
              {String(slot).padStart(2, "0")}
            </Link>
          ) : (
            <button
              key={slot}
              type="button"
              className={`${styles.pageBtn} ${slot === page ? styles.active : ""}`}
              onClick={() => onPageChange?.(slot)}
              aria-current={slot === page ? "page" : undefined}
              aria-label={`Page ${slot}`}
            >
              {slot}
            </button>
          ),
        )}

        {step(1, "next", page >= totalPages)}
      </div>

      {linked && (
        <div className={styles.progressTrack} aria-hidden="true">
          <div
            className={styles.progressFill}
            style={{ width: `${(page / totalPages) * 100}%` }}
          />
        </div>
      )}
    </nav>
  );
}

function getVisiblePages(
  current: number,
  total: number,
  maxVisible: number,
): (number | "...")[] {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [];
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(2, current - half);
  let end = Math.min(total - 1, current + half);

  if (current - half <= 2) {
    end = Math.min(total - 1, maxVisible - 1);
  }
  if (current + half >= total - 1) {
    start = Math.max(2, total - maxVisible + 2);
  }

  pages.push(1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);

  return pages;
}
