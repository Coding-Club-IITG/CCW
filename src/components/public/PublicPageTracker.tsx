"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { isPublicAnalyticsPage } from "@/lib/telemetry/publicPage";

let pending = Promise.resolve();

async function track(page: string) {
  const body = JSON.stringify({ page, eventId: crypto.randomUUID() });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch("/api/analytics/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "same-origin",
      keepalive: true,
    });
    if (!response.ok) return;
    const result = await response.json();
    if (!result.ok || !result.data.needsCookie) return;
  }
}

export default function PublicPageTracker() {
  const pathname = usePathname();
  const lastPage = useRef<string | null>(null);
  useEffect(() => {
    if (
      !pathname ||
      !isPublicAnalyticsPage(pathname) ||
      lastPage.current === pathname
    )
      return;
    if (
      navigator.doNotTrack === "1" ||
      (navigator as Navigator & { globalPrivacyControl?: boolean })
        .globalPrivacyControl
    )
      return;
    const record = () => {
      if (
        document.visibilityState !== "visible" ||
        lastPage.current === pathname
      )
        return;
      lastPage.current = pathname;
      // Serialize initial cookie establishment and subsequent client navigations
      pending = pending.then(() => track(pathname)).catch(() => {});
    };
    record();
    document.addEventListener("visibilitychange", record);
    return () => document.removeEventListener("visibilitychange", record);
  }, [pathname]);
  return null;
}
