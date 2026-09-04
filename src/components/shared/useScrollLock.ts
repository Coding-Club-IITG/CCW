"use client";

import { useEffect } from "react";

// Reference-counted so nested overlays restore correctly
let lockCount = 0;
let previousOverflow = "";

function acquire() {
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function release() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow;
  }
}

/** Locks body scroll while mounted, safe under nesting */
export function useScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active]);
}
