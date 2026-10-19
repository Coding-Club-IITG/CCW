// Unsaved-changes protection for in-app navigation. Pure decisions and a small
// controller so Stay/Leave behavior is testable; the DOM wiring lives in the hook.

export type LinkLike = {
  href: string;
  target?: string | null;
  download?: boolean;
  button?: number;
  modifiers?: { meta?: boolean; ctrl?: boolean; shift?: boolean; alt?: boolean };
};

/**
 * Returns the in-app path a click would navigate to, or null when the click is not
 * a plain same-origin navigation to a different page (new tab, download, hash-only...).
 */
export function internalNavigationTarget(link: LinkLike, current: URL): string | null {
  if (link.download || (link.target && link.target !== "_self")) return null;
  if (link.button && link.button !== 0) return null;
  if (link.modifiers && Object.values(link.modifiers).some(Boolean)) return null;
  let url: URL;
  try {
    url = new URL(link.href, current);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  if (url.pathname === current.pathname && url.search === current.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export type NavigationGuardOptions = {
  isDirty: () => boolean;
  /** Resolves true for Leave, false for Stay. */
  confirmLeave: () => Promise<boolean>;
  navigate: (href: string) => void;
};

export function createNavigationGuard({ isDirty, confirmLeave, navigate }: NavigationGuardOptions) {
  let asking = false;
  let bypass = false;
  return {
    /** Whether a navigation must be intercepted and routed through `request`. */
    shouldIntercept: () => !bypass && isDirty(),
    /** Asks the host; navigates only on Leave. Repeated clicks while asking are ignored. */
    async request(href: string, proceed: () => void | Promise<unknown> = () => navigate(href)): Promise<"left" | "stayed" | "ignored"> {
      if (asking) return "ignored";
      asking = true;
      try {
        if (isDirty() && !bypass && !(await confirmLeave())) return "stayed";
        bypass = true;
        await proceed();
        return "left";
      } catch {
        return "stayed";
      } finally {
        // A traversal can finish without unmounting this editor (for example, a query change).
        bypass = false;
        asking = false;
      }
    },
    /** Value for `event.returnValue` on beforeunload, or null when there is nothing to protect. */
    beforeUnload: () => (!bypass && isDirty() ? "You have unsaved changes." : null),
  };
}

/** Cancel before Next handles popstate, then resume the original history entry on Leave. */
export async function guardHistoryNavigation(
  event: Pick<NavigateEvent, "defaultPrevented" | "cancelable" | "navigationType" | "destination" | "preventDefault">,
  current: URL,
  guard: ReturnType<typeof createNavigationGuard>,
  traverseTo: (key: string) => Promise<unknown>,
) {
  if (event.defaultPrevented || !event.cancelable || event.navigationType !== "traverse" ||
    !event.destination.sameDocument || !guard.shouldIntercept()) return "ignored";
  const href = internalNavigationTarget({ href: event.destination.url }, current);
  if (!href) return "ignored";
  event.preventDefault();
  return guard.request(href, async () => { await traverseTo(event.destination.key); });
}
