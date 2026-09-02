import styles from "./EmptyState.module.scss";

/** Shared "nothing matches" placeholder for filtered collections */
export default function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className={styles.empty}>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
