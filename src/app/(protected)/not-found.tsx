import Link from "next/link";
import styles from "./StatePage.module.scss";

export default function NotFound() {
  return (
    <div className={styles.wrap}>
      <p className={styles.kicker}>Error 404 · nothing here</p>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>That page isn&apos;t here any more.</h1>
      <p className={styles.lead}>
        It may have been deleted, or the link is stale.
      </p>
      <div className={styles.actions}>
        <Link
          href="/internal/dashboard"
          className={`${styles.action} ${styles.actionPrimary}`}
        >
          Dashboard
        </Link>
        <Link href="/internal/files" className={styles.action}>
          Files
        </Link>
      </div>
    </div>
  );
}
