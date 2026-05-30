import styles from "./TagBadge.module.scss";

interface TagBadgeProps {
  tag: string;
  onClick?: () => void;
  active?: boolean;
}

export default function TagBadge({ tag, onClick, active }: TagBadgeProps) {
  const className = `${styles.tag} ${active ? styles.active : ""}`;

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {tag}
      </button>
    );
  }

  return <span className={className}>{tag}</span>;
}
