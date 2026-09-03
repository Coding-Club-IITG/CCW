import type { ReactNode } from "react";
import styles from "./Skeleton.module.scss";

/** Shared shell for every loading.tsx */
export default function SkeletonPage({
  kicker = "Internal",
  title,
  lead,
  children,
}: {
  kicker?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>{kicker}</p>
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
        </div>
      </header>
      <div aria-busy="true">
        <span className={styles.status} role="status" aria-live="polite">
          Loading {title}…
        </span>
        {children}
      </div>
    </div>
  );
}
