import Link from "next/link";
import styles from "./LinkCard.module.scss";

interface LinkCardProps {
  href: string;
  title: string;
  description: string;
  external?: boolean;
}

export default function LinkCard({
  href,
  title,
  description,
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
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>
      </a>
    );
  }

  return (
    <Link href={href} className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
    </Link>
  );
}
