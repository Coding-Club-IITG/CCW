import { describe, expect, it, vi } from "vitest";

import { createNavigationGuard, guardHistoryNavigation, internalNavigationTarget } from "@/lib/pulse/navigationGuard";

const current = new URL("https://ccw.test/pulse/host/q1/edit");

describe("internalNavigationTarget", () => {
  it("returns the path for plain same-origin navigations", () => {
    expect(internalNavigationTarget({ href: "/pulse/host" }, current)).toBe("/pulse/host");
    expect(internalNavigationTarget({ href: "https://ccw.test/blogs?x=1#top" }, current)).toBe("/blogs?x=1#top");
  });

  it("ignores external links, same-page links, new tabs, downloads and modified clicks", () => {
    for (const link of [
      { href: "https://example.com/" },
      { href: "/pulse/host/q1/edit" },
      { href: "/pulse/host/q1/edit#slide" },
      { href: "/x", target: "_blank" },
      { href: "/x", download: true },
      { href: "/x", button: 1 },
      { href: "/x", modifiers: { meta: true } },
      { href: "http://[bad" },
    ]) expect(internalNavigationTarget(link, current)).toBeNull();
  });
});

type HistoryEvent = Parameters<typeof guardHistoryNavigation>[0];
function historyEvent(patch: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    defaultPrevented: false, cancelable: true, navigationType: "traverse",
    destination: { url: "https://ccw.test/pulse/host", key: "back-entry", id: "back-id", index: 0, sameDocument: true, getState: () => undefined },
    preventDefault: vi.fn(), ...patch,
  };
}

describe("browser history navigation", () => {
  it.each(["back-entry", "forward-entry"])("resumes the exact %s on Leave without pushing a new route", async (key) => {
    const g = guard(true, true);
    const event = historyEvent();
    const traverse = vi.fn(async () => undefined);
    const result = guardHistoryNavigation({ ...event, destination: { ...event.destination, key } }, current, g.guard, traverse);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(await result).toBe("left");
    expect(traverse).toHaveBeenCalledExactlyOnceWith(key);
    expect(g.navigate).not.toHaveBeenCalled();
  });

  it("Stay cancels the traversal and keeps the draft protected", async () => {
    const g = guard(true, false);
    const event = historyEvent();
    const traverse = vi.fn(async () => undefined);
    expect(await guardHistoryNavigation(event, current, g.guard, traverse)).toBe("stayed");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(traverse).not.toHaveBeenCalled();
    expect(g.guard.shouldIntercept()).toBe(true);
  });

  it("lets clean decks traverse normally without a prompt", async () => {
    const g = guard(false, false);
    const event = historyEvent();
    const traverse = vi.fn(async () => undefined);
    expect(await guardHistoryNavigation(event, current, g.guard, traverse)).toBe("ignored");
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(g.confirmLeave).not.toHaveBeenCalled();
    expect(traverse).not.toHaveBeenCalled();
  });

  it("cancels repeated Back/Forward requests without replacing the pending destination", async () => {
    let answer!: (leave: boolean) => void;
    const confirmLeave = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve; }));
    const controller = createNavigationGuard({ isDirty: () => true, confirmLeave, navigate: vi.fn() });
    const traverse = vi.fn(async () => undefined);
    const first = guardHistoryNavigation(historyEvent(), current, controller, traverse);
    const repeated = historyEvent({ destination: { ...historyEvent().destination, key: "other-entry" } });
    expect(await guardHistoryNavigation(repeated, current, controller, traverse)).toBe("ignored");
    expect(repeated.preventDefault).toHaveBeenCalledOnce();
    expect(confirmLeave).toHaveBeenCalledOnce();
    answer(true);
    expect(await first).toBe("left");
    expect(traverse).toHaveBeenCalledExactlyOnceWith("back-entry");
  });

  it("protects the draft again if the resumed traversal fails", async () => {
    const g = guard(true, true);
    const traverse = vi.fn(async () => { throw new DOMException("Superseded", "AbortError"); });
    expect(await guardHistoryNavigation(historyEvent(), current, g.guard, traverse)).toBe("stayed");
    expect(g.guard.shouldIntercept()).toBe(true);
    expect(g.guard.beforeUnload()).toMatch(/unsaved/i);
  });

  it("leaves same-page, cross-document and noncancelable navigations to the browser", async () => {
    const g = guard(true, true);
    const base = historyEvent();
    const patches: Partial<HistoryEvent>[] = [
      { defaultPrevented: true }, { cancelable: false }, { navigationType: "reload" },
      { destination: { ...base.destination, sameDocument: false } },
      { destination: { ...base.destination, url: `${current.href}#slide` } },
      { destination: { ...base.destination, url: "https://example.com/" } },
    ];
    for (const patch of patches) {
      const event = historyEvent(patch);
      expect(await guardHistoryNavigation(event, current, g.guard, vi.fn())).toBe("ignored");
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
    expect(g.confirmLeave).not.toHaveBeenCalled();
  });
});

function guard(dirty: boolean, answer: boolean) {
  const state = { dirty };
  const navigate = vi.fn();
  const confirmLeave = vi.fn(async () => answer);
  return { state, navigate, confirmLeave, guard: createNavigationGuard({ isDirty: () => state.dirty, confirmLeave, navigate }) };
}

describe("navigation guard", () => {
  it("navigates freely when there is nothing unsaved", async () => {
    const g = guard(false, false);
    expect(g.guard.shouldIntercept()).toBe(false);
    expect(await g.guard.request("/a")).toBe("left");
    expect(g.confirmLeave).not.toHaveBeenCalled();
    expect(g.navigate).toHaveBeenCalledWith("/a");
    expect(g.guard.beforeUnload()).toBeNull();
  });

  it("Stay keeps the page and the draft", async () => {
    const g = guard(true, false);
    expect(g.guard.shouldIntercept()).toBe(true);
    expect(await g.guard.request("/a")).toBe("stayed");
    expect(g.navigate).not.toHaveBeenCalled();
    expect(g.guard.shouldIntercept()).toBe(true); // still protected afterwards
  });

  it("Leave navigates once", async () => {
    const g = guard(true, true);
    expect(await g.guard.request("/a")).toBe("left");
    expect(g.navigate).toHaveBeenCalledExactlyOnceWith("/a");
  });

  it("asks once even when clicked repeatedly", async () => {
    const g = guard(true, true);
    const results = await Promise.all([g.guard.request("/a"), g.guard.request("/a")]);
    expect(results.sort()).toEqual(["ignored", "left"]);
    expect(g.confirmLeave).toHaveBeenCalledTimes(1);
  });

  it("asks again after Stay, and stops protecting once the draft is saved", async () => {
    const g = guard(true, false);
    await g.guard.request("/a");
    await g.guard.request("/a");
    expect(g.confirmLeave).toHaveBeenCalledTimes(2);
    g.state.dirty = false;
    expect(g.guard.shouldIntercept()).toBe(false);
    expect(g.guard.beforeUnload()).toBeNull();
  });

  it("warns on page unload only while dirty", () => {
    const g = guard(true, true);
    expect(g.guard.beforeUnload()).toMatch(/unsaved/i);
    g.state.dirty = false;
    expect(g.guard.beforeUnload()).toBeNull();
  });

  it("bypasses the approved traversal, then protects edits if the editor remains mounted", async () => {
    const g = guard(true, true);
    let finish!: () => void;
    const proceed = () => new Promise<void>((resolve) => { finish = resolve; });
    const result = g.guard.request("/a", proceed);
    await Promise.resolve();
    expect(g.guard.beforeUnload()).toBeNull();
    expect(g.guard.shouldIntercept()).toBe(false);
    finish();
    expect(await result).toBe("left");
    expect(g.guard.shouldIntercept()).toBe(true);
    expect(g.guard.beforeUnload()).toMatch(/unsaved/i);
  });
});
