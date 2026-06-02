"use client";

import styles from "./Pagination.module.scss";

type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  maxVisible?: number;
};

export default function Pagination({
  page,
  totalPages,
  onPageChange,
  maxVisible = 5,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getVisiblePages(page, totalPages, maxVisible);

  return (
    <div className={styles.pagination}>
      <button
        className={styles.pageBtn}
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        ‹
      </button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className={styles.ellipsis}>
            …
          </span>
        ) : (
          <button
            key={p}
            className={`${styles.pageBtn} ${p === page ? styles.active : ""}`}
            onClick={() => onPageChange(p as number)}
            aria-current={p === page ? "page" : undefined}
          >
            {p}
          </button>
        ),
      )}

      <button
        className={styles.pageBtn}
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
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
