import Link from "next/link";

import styles from "./FilterControls.module.scss";

export type FilterOption = {
  label: string;
  href: string;
  active: boolean;
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
      {options.map((option) => (
        <Link
          key={option.href + option.label}
          href={option.href}
          className={`${styles.chip} ${option.active ? styles.chipActive : ""}`}
          aria-current={option.active ? "true" : undefined}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}
