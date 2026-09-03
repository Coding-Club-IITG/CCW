import Link from "next/link";

import styles from "./FilterControls.module.scss";

type FilterOptionBase = {
  label: string;
  active: boolean;
  ariaLabel?: string;
};

export type FilterOption = FilterOptionBase &
  ({ href: string; onClick?: never } | { href?: never; onClick: () => void });

/** Row of outlined filter chips */
export default function FilterChips({
  options,
  label,
}: {
  options: FilterOption[];
  label: string;
}) {
  return (
    <div className={styles.chipRow} role="group" aria-label={label}>
      {options.map((option) => {
        const className = `${styles.chip} ${option.active ? styles.chipActive : ""}`;

        return option.href !== undefined ? (
          <Link
            key={option.href + option.label}
            href={option.href}
            className={className}
            aria-current={option.active ? "true" : undefined}
            aria-label={option.ariaLabel}
          >
            {option.label}
          </Link>
        ) : (
          <button
            key={option.label}
            type="button"
            className={className}
            onClick={option.onClick}
            aria-pressed={option.active}
            aria-label={option.ariaLabel}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
