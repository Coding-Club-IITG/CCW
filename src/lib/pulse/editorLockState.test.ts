import { describe, expect, it } from "vitest";

import {
  canEditWithLock,
  initialLockState,
  lockReducer,
  lockToken,
  type LockEvent,
  type LockState,
} from "@/lib/pulse/editorLockState";

const run = (start: LockState, ...events: LockEvent[]) => events.reduce(lockReducer, start);
const acquired: LockEvent = { type: "acquired", token: "t1" };
const holder = { name: "Alice" };

describe("lock state transitions", () => {
  it("starts acquiring only when the quiz is editable", () => {
    expect(initialLockState(true)).toEqual({ phase: "acquiring" });
    expect(initialLockState(false)).toEqual({ phase: "idle" });
  });

  it("acquiring → held lets the host edit and exposes the token", () => {
    const state = run(initialLockState(true), acquired);
    expect(state).toEqual({ phase: "held", token: "t1" });
    expect(canEditWithLock(state)).toBe(true);
    expect(lockToken(state)).toBe("t1");
  });

  it("acquiring → blocked names the holder and is read-only; a later acquire takes over", () => {
    const blocked = run(initialLockState(true), { type: "blocked", holder });
    expect(blocked).toEqual({ phase: "blocked", holder });
    expect(canEditWithLock(blocked)).toBe(false);
    expect(lockToken(blocked)).toBeNull();
    expect(run(blocked, { type: "acquire-started" }, acquired).phase).toBe("held");
  });

  it("a lost lock stops editing and can be re-acquired", () => {
    const lost = run(initialLockState(true), acquired, { type: "lock-lost" });
    expect(lost.phase).toBe("lost");
    expect(canEditWithLock(lost)).toBe(false);
    expect(lockToken(lost)).toBeNull();
    expect(run(lost, { type: "acquire-started" }).phase).toBe("acquiring");
    expect(run(lost, { type: "acquire-started" }, acquired).phase).toBe("held");
  });

  it("does not drop a held lock on a repeated acquire attempt", () => {
    const held = run(initialLockState(true), acquired);
    expect(lockReducer(held, { type: "acquire-started" })).toBe(held);
  });

  it("ignores a lost-lock signal when no lock is held", () => {
    const blocked = run(initialLockState(true), { type: "blocked", holder });
    expect(lockReducer(blocked, { type: "lock-lost" })).toBe(blocked);
  });

  it("reports an unavailable lock service and can recover", () => {
    const unavailable = run(initialLockState(true), { type: "service-error", message: "down" });
    expect(unavailable).toEqual({ phase: "unavailable", message: "down" });
    expect(canEditWithLock(unavailable)).toBe(false);
    expect(run(unavailable, { type: "acquire-started" }, acquired).phase).toBe("held");
  });

  it("release returns to idle", () => {
    expect(run(initialLockState(true), acquired, { type: "released" }).phase).toBe("idle");
  });
});
