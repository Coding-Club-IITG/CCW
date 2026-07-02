"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

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
    const scrollableContainers = document.querySelectorAll('.overflow-y-auto, .overflow-auto');
    scrollableContainers.forEach(el => el.scrollTo(0, 0));
  }, [pathname]);

  // The contests layout requires full bleed (no max-width, no padding)
  // because it provides its own background and layout structure.
  if (pathname?.startsWith("/internal/contests")) {
    return (
      <>
        <style>{`body { background-color: #131313 !important; }`}</style>
        <main className="flex-1 flex flex-col">{children}</main>
      </>
    );
  }

  return (
    <main
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "2rem",
      }}
    >
      {children}
    </main>
  );
}
