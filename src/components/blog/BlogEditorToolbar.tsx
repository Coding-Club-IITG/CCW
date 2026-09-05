import {
  ExternalLink as IconExternalLink,
  History as IconHistory,
} from "lucide-react";
import Link from "next/link";

import BackLink from "@/components/shared/BackLink";

import styles from "./BlogEditorToolbar.module.scss";

interface BlogEditorToolbarProps {
  backHref: string;
  backLabel: string;
  liveHref?: string;
  onOpenHistory?: () => void;
  revisionCount?: number;
}

export default function BlogEditorToolbar({
  backHref,
  backLabel,
  liveHref,
  onOpenHistory,
  revisionCount,
}: BlogEditorToolbarProps) {
  return (
    <nav className={styles.toolbar} aria-label="Blog editor navigation">
      <BackLink href={backHref} label={backLabel} />
      <div className={styles.actions}>
        {onOpenHistory && (
          <button
            type="button"
            className={styles.historyBtn}
            onClick={onOpenHistory}
            aria-label="View revision history"
          >
            <IconHistory width={14} height={14} />
            Revision history
            {revisionCount !== undefined && revisionCount > 0
              ? ` (${revisionCount})`
              : ""}
          </button>
        )}
        {liveHref && (
          <Link
            href={liveHref}
            className={styles.liveLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            View live post <IconExternalLink width={14} height={14} />
          </Link>
        )}
      </div>
    </nav>
  );
}
