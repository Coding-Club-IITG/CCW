import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Megaphone } from "lucide-react";

import type { Announcement } from "@/lib/announcements";

import styles from "./AnnouncementBanner.module.scss";

interface AnnouncementBannerProps {
  announcement: Announcement;
  icon?: ReactNode;
}

export default function AnnouncementBanner({
  announcement,
  icon = <Megaphone size={20} strokeWidth={1.5} />,
}: AnnouncementBannerProps) {
  const { title, eyebrow, description, detail, action } = announcement;
  const ActionIcon = action.external ? ArrowUpRight : ArrowRight;

  return (
    <aside aria-label={title}>
      <Link
        href={action.href}
        className={styles.banner}
        target={action.external ? "_blank" : undefined}
        rel={action.external ? "noopener noreferrer" : undefined}
        aria-label={`${title}: ${action.label}${action.external ? " (opens in a new tab)" : ""}`}
      >
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
        <div className={styles.copy}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.description}>{description}</p>
        </div>
        <div className={styles.actionGroup}>
          <span className={styles.action}>
            {action.label}
            <ActionIcon
              size={17}
              className={`${styles.arrow} ${action.external ? styles.externalArrow : ""}`}
              aria-hidden="true"
            />
          </span>
          {detail && <p className={styles.detail}>{detail}</p>}
        </div>
      </Link>
    </aside>
  );
}
