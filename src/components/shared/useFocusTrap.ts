"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const focusLayers: HTMLElement[] = [];

/**
 * Confine Tab to the contents of 'containerRef' while 'active',
 * and restore focus to whatever was focused beforehand on teardown.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active = true,
) {
  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const layer = containerRef.current;
    if (!layer) return;
    focusLayers.push(layer);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container || focusLayers.at(-1) !== container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter(
        (element) =>
          element.offsetParent !== null && !element.matches(":disabled"),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      // Wrap in both directions, and pull focus back in if it has escaped
      if (
        event.shiftKey &&
        (current === first || !container.contains(current))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const wasTop = focusLayers.at(-1) === layer;
      const index = focusLayers.lastIndexOf(layer);
      if (index !== -1) focusLayers.splice(index, 1);
      if (wasTop) previouslyFocused?.focus?.();
    };
  }, [containerRef, active]);
}
