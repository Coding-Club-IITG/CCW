import Link from "next/link";
import type { ComponentType } from "react";

import styles from "./FilterControls.module.scss";

export type Segment = {
  label: string;
  href: string;
  active: boolean;
  Icon?: ComponentType<{ size?: number; "aria-hidden"?: boolean | "true" }>;
};

/**
 * Joined two-or-more option control used for sort order and layout choice
 */
export default function SegmentedControl({
  segments,
  label,
}: {
  segments: Segment[];
  label: string;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {segments.map(({ label: text, href, active, Icon }) => (
        <Link
          key={href + text}
          href={href}
          className={`${styles.segment} ${active ? styles.segmentActive : ""}`}
          aria-current={active ? "true" : undefined}
        >
          {Icon && <Icon size={13} aria-hidden="true" />}
          {text}
        </Link>
      ))}
    </div>
  );
}
