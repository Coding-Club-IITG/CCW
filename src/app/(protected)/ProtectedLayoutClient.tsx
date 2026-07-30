"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import styles from "./ProtectedLayoutClient.module.scss";

export default function ProtectedLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  useEffect(() => {
    // 1. Scroll the main window
    window.scrollTo(0, 0);

    // 2. Scroll any inner nested overflow containers (which bypass Next.js default scroll restoration)
    const scrollableContainers = document.querySelectorAll(
      ".overflow-y-auto, .overflow-auto",
    );
    scrollableContainers.forEach((el) => el.scrollTo(0, 0));
  }, [pathname]);

  const isContestDocumentPage =
    pathname === "/internal/contests" ||
    pathname === "/internal/contests/history" ||
    /^\/internal\/contests\/rooms\/[^/]+\/result$/.test(pathname ?? "");

  // The contests layout requires full bleed (no max-width, no padding)
  // because it provides its own background and layout structure.
  if (pathname?.startsWith("/internal/contests")) {
    return (
      <main
        className={
          isContestDocumentPage
            ? styles.contestDocumentMain
            : styles.contestMain
        }
      >
        {children}
      </main>
    );
  }

  return <main className={styles.pageMain}>{children}</main>;
}
