"use client";

import { useEffect } from "react";

const warning =
  "Leave this match? The match and timers will continue, and you cannot play another live match until it ends.";

type MatchNavigateEvent = Event & {
  canIntercept: boolean;
  hashChange: boolean;
  navigationType: string;
};

export function useMatchNavigationWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;

    let approvedLink = false;
    const currentUrl = window.location.href;
    const currentHistoryState = window.history.state;
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;

    function beforeUnload(event: BeforeUnloadEvent) {
      if (approvedLink) return;

      event.preventDefault();
      event.returnValue = "";
    }

    // Intercept links before Next starts navigating because pushState is not cancellable
    function click(event: MouseEvent) {
      const link =
        event.target instanceof Element ? event.target.closest("a") : null;

      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0 ||
        link.href === window.location.href
      )
        return;

      if (window.confirm(warning)) {
        approvedLink = true;
      } else {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    function navigate(event: Event) {
      const transition = event as MatchNavigateEvent;

      if (
        transition.navigationType === "traverse" &&
        transition.canIntercept &&
        transition.cancelable &&
        !transition.hashChange &&
        !window.confirm(warning)
      ) {
        transition.preventDefault();
      }
    }

    // Older browsers need to restore the current history entry when traversal is cancelled
    function popState(event: PopStateEvent) {
      if (!window.confirm(warning)) {
        event.stopImmediatePropagation();
        window.history.pushState(currentHistoryState, "", currentUrl);
      }
    }

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);

    if (navigation) {
      navigation.addEventListener("navigate", navigate);
    } else {
      window.addEventListener("popstate", popState, true);
    }

    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
      navigation?.removeEventListener("navigate", navigate);
      window.removeEventListener("popstate", popState, true);
    };
  }, [active]);
}
