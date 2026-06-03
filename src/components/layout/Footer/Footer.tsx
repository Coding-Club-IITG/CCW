import Link from "next/link";
import {
  IconGithub,
  IconInstagram,
  IconLinkedIn,
  IconMail,
} from "@/components/shared/Icons";
import styles from "./Footer.module.scss";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.content}>
        <div className={styles.left}>
          <span className={styles.brand}>Coding Club IITG</span>
          <span className={styles.address}>
            IIT Guwahati, Assam - 781039, India
          </span>
          <span className={styles.copyright}>
            © 2026 Coding Club IITG. All rights reserved.
          </span>
        </div>

        <div className={styles.socials}>
          <Link
            href="https://github.com/Coding-Club-IITG"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.socialLink}
            aria-label="GitHub"
          >
            <IconGithub width={20} height={20} />
          </Link>
          <Link
            href="https://instagram.com/codingclubiitg"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.socialLink}
            aria-label="Instagram"
          >
            <IconInstagram width={20} height={20} />
          </Link>
          <Link
            href="https://linkedin.com/company/coding-club-iitg"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.socialLink}
            aria-label="LinkedIn"
          >
            <IconLinkedIn width={20} height={20} />
          </Link>
          <Link
            href="mailto:codingclub@iitg.ac.in"
            className={styles.socialLink}
            aria-label="Email"
          >
            <IconMail width={20} height={20} />
          </Link>
        </div>
      </div>
    </footer>
  );
}
