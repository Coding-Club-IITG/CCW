import { ReactNode } from "react";
import Link from "next/link";
import styles from "./LinkCard.module.scss";

interface LinkCardProps {
  href: string;
  title: string;
  description: string;
  icon?: ReactNode;
  external?: boolean;
}

export default function LinkCard({
  href,
  title,
  description,
  icon,
  external,
}: LinkCardProps) {
  if (external) {
    return (
      <a
        href={href}
        className={styles.card}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div className={styles.heading}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <h3 className={styles.title}>{title}</h3>
        </div>
        <p className={styles.description}>{description}</p>
      </a>
    );
  }

  return (
    <Link href={href} className={styles.card}>
      <div className={styles.heading}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <h3 className={styles.title}>{title}</h3>
      </div>
      <p className={styles.description}>{description}</p>
    </Link>
  );
}
