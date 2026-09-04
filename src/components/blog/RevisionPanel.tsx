"use client";

import type { ReactNode } from "react";
import { useId } from "react";

import styles from "./RevisionPanel.module.scss";

type RevisionPanelTone = "info" | "warning" | "success";

interface RevisionPanelProps {
  title: string;
  badge?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  tone?: RevisionPanelTone;
}

export default function RevisionPanel({
  title,
  badge,
  description,
  actions,
  children,
  tone = "info",
}: RevisionPanelProps) {
  const titleId = useId();

  return (
    <section
      className={`${styles.panel} ${styles[tone]}`}
      aria-labelledby={titleId}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {badge && <span className={styles.badge}>{badge}</span>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      {description && <p className={styles.description}>{description}</p>}
      {children && <div className={styles.content}>{children}</div>}
    </section>
  );
}
