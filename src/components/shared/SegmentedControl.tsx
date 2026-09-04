import type { ComponentType } from "react";

import ControlOptionItem, {
  optionKey,
  type ControlOption,
} from "./ControlOption";
import styles from "./FilterControls.module.scss";

export type Segment = ControlOption & {
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
      {segments.map(({ Icon, ...segment }) => (
        <ControlOptionItem
          key={optionKey(segment)}
          option={segment}
          className={`${styles.segment} ${segment.active ? styles.segmentActive : ""}`}
        >
          {Icon && <Icon size={13} aria-hidden="true" />}
          {segment.label}
        </ControlOptionItem>
      ))}
    </div>
  );
}
