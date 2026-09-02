import Link from "next/link";
import type { ComponentType } from "react";

import styles from "./FilterControls.module.scss";

export type Segment = {
  label: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
  Icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
};

/** Joined two-or-more option control used for sort order and layout choice */
export default function SegmentedControl({
  segments,
  label,
}: {
  segments: Segment[];
  label: string;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {segments.map(({ label: text, href, active, onClick, Icon }) => {
        const className = `${styles.segment} ${active ? styles.segmentActive : ""}`;
        const content = (
          <>
            {Icon && <Icon size={13} aria-hidden="true" />}
            {text}
          </>
        );

        return href ? (
          <Link
            key={href + text}
            href={href}
            className={className}
            aria-current={active ? "true" : undefined}
          >
            {content}
          </Link>
        ) : (
          <button
            key={text}
            type="button"
            className={className}
            onClick={onClick}
            aria-pressed={active}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
