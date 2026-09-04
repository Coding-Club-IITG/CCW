import { ExternalLink as IconExternalLink } from "lucide-react";
import Link from "next/link";

import BackLink from "@/components/shared/BackLink";

import styles from "./BlogEditorToolbar.module.scss";

interface BlogEditorToolbarProps {
  backHref: string;
  backLabel: string;
  liveHref?: string;
}

export default function BlogEditorToolbar({
  backHref,
  backLabel,
  liveHref,
}: BlogEditorToolbarProps) {
  return (
    <nav className={styles.toolbar} aria-label="Blog editor navigation">
      <BackLink href={backHref} label={backLabel} />
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
    </nav>
  );
}
