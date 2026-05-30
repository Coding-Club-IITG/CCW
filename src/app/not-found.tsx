import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import styles from "./not-found.module.scss";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.glitch}>404</div>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.description}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
        Let&apos;s get you back on track.
      </p>
      <div className={styles.actions}>
        <Link href="/" className={styles.homeButton}>
          <ArrowLeft size={16} />
          Go Home
        </Link>
      </div>
      <div className={styles.divider} />
      <p className={styles.hint}>Coding Club IIT Guwahati</p>
    </div>
  );
}
