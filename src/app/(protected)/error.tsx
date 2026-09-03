"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import styles from "./StatePage.module.scss";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    console.error(error);
  }, [error]);

  const slug =
    (pathname ?? "")
      .split("/")
      .filter(Boolean)
      .slice(0, 2)
      .join("_")
      .replace(/[^a-z0-9_]/gi, "")
      .toUpperCase() || "PROTECTED";

  return (
    <div className={`${styles.wrap} ${styles.error}`}>
      <p className={styles.kicker}>Error 500 · this page failed</p>
      <p className={styles.code}>500</p>
      <h1 className={styles.title}>Something broke while loading this.</h1>
      <p className={styles.lead}>
        Reloading usually fixes it - if it doesn&apos;t, send us the code below.
      </p>
      <p className={styles.ref}>
        {slug}_RENDER{error.digest ? ` · ${error.digest.slice(0, 6)}` : ""}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          onClick={reset}
          className={`${styles.action} ${styles.actionPrimary}`}
        >
          Reload
        </button>
        <a
          href="https://github.com/Coding-Club-IITG/CCW/issues/new"
          target="_blank"
          rel="noreferrer"
          className={styles.action}
        >
          Report it
        </a>
      </div>
    </div>
  );
}
