import {
  ExternalLink as IconExternalLink,
  History as IconHistory,
} from "lucide-react";
import Link from "next/link";

import BackLink from "@/components/shared/BackLink";
import Button from "@/components/shared/Button";

import styles from "./BlogEditorToolbar.module.scss";

interface BlogEditorToolbarProps {
  backHref: string;
  backLabel: string;
  liveHref?: string;
  onOpenHistory?: () => void;
}

export default function BlogEditorToolbar({
  backHref,
  backLabel,
  liveHref,
  onOpenHistory,
}: BlogEditorToolbarProps) {
  return (
    <nav className={styles.toolbar} aria-label="Blog editor navigation">
      <BackLink href={backHref} label={backLabel} />
      <div className={styles.actions}>
        {onOpenHistory && (
          <Button size="small" onClick={onOpenHistory}>
            <IconHistory width={14} height={14} aria-hidden="true" />
            Revision history
          </Button>
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
