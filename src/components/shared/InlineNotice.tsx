import type { ReactNode } from "react";

import styles from "./InlineNotice.module.scss";

type InlineNoticeTone = "error" | "info" | "success" | "warning";

interface InlineNoticeProps {
  children: ReactNode;
  tone?: InlineNoticeTone;
}

export default function InlineNotice({
  children,
  tone = "info",
}: InlineNoticeProps) {
  const isError = tone === "error";

  return (
    <div
      className={`${styles.notice} ${styles[tone]}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <span className={styles.marker} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
