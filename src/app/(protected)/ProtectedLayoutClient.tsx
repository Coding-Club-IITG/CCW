"use client";

import { usePathname } from "next/navigation";

export default function ProtectedLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

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
