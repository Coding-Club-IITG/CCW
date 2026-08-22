import type { EventStatus, ProjectStatus } from "@/lib/constants";
import styles from "./StatusBadge.module.scss";

interface StatusBadgeProps {
  status: EventStatus | ProjectStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[status.toLowerCase()]}`}>
      {status}
    </span>
  );
}
