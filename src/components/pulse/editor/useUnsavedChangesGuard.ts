"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { createNavigationGuard, internalNavigationTarget } from "@/lib/pulse/navigationGuard";

/**
 * Protects unsaved edits: in-app link clicks ask Stay/Leave; closing or reloading the
 * tab uses the browser's own beforeunload prompt. Next's App Router has no
 * route-blocking API, so links are intercepted in the capture phase.
 */
export function useUnsavedChangesGuard(isDirty: () => boolean, confirmLeave: () => Promise<boolean>) {
  const router = useRouter();
  const latest = useRef({ isDirty, confirmLeave });
  useEffect(() => {
    latest.current = { isDirty, confirmLeave };
  });

  useEffect(() => {
    const guard = createNavigationGuard({
      isDirty: () => latest.current.isDirty(),
      confirmLeave: () => latest.current.confirmLeave(),
      navigate: (href) => router.push(href),
    });

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !guard.shouldIntercept()) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = internalNavigationTarget({
        href: anchor.href, target: anchor.target, download: anchor.hasAttribute("download"), button: event.button,
        modifiers: { meta: event.metaKey, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey },
      }, new URL(window.location.href));
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      void guard.request(href);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const message = guard.beforeUnload();
      if (!message) return;
      event.preventDefault();
      event.returnValue = message;
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [router]);
}
