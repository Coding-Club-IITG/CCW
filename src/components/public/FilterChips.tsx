import Link from "next/link";

import styles from "./FilterControls.module.scss";

export type FilterOption = {
  label: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
};

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

        return option.href ? (
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
