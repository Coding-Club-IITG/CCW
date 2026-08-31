import styles from "./TagBadge.module.scss";

interface TagBadgeProps {
  tag: string;
  onClick?: () => void;
  active?: boolean;
  count?: number;
  removable?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
}

export default function TagBadge({
  tag,
  onClick,
  active,
  count,
  removable = false,
  ariaLabel,
  disabled = false,
}: TagBadgeProps) {
  const className = `${styles.tag} ${active ? styles.active : ""}`;

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={active === undefined ? undefined : active}
        disabled={disabled}
      >
        {tag}
        {typeof count === "number" && (
          <span className={styles.count}>{count}</span>
        )}
        {removable && <span aria-hidden="true">×</span>}
      </button>
    );
  }

  return (
    <span className={className}>
      {tag}
      {typeof count === "number" && (
        <span className={styles.count}>{count}</span>
      )}
    </span>
  );
}
