import { describe, expect, it, vi } from "vitest";

import { createNavigationGuard, internalNavigationTarget } from "@/lib/pulse/navigationGuard";

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

  it("stops warning after the host chose Leave", async () => {
    const g = guard(true, true);
    await g.guard.request("/a");
    expect(g.guard.beforeUnload()).toBeNull();
    expect(g.guard.shouldIntercept()).toBe(false);
  });
});
