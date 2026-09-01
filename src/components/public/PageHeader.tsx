import type { ReactNode } from "react";

import styles from "./PageHeader.module.scss";

type Props = {
  kicker: ReactNode;
  title: string;
  lead: ReactNode;
  glow?: "sky" | "red" | "violet" | "ember";
};

/**
 * The full-bleed header band shared by every public archive page
 */
export default function PageHeader({
  kicker,
  title,
  lead,
  glow = "sky",
}: Props) {
  return (
    <header className={`${styles.header} ${styles[glow]}`}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        <div>
          <p className={styles.kicker}>{kicker}</p>
          <h1 className={styles.title}>{title}</h1>
        </div>
        <p className={styles.lead}>{lead}</p>
      </div>
    </header>
  );
}
