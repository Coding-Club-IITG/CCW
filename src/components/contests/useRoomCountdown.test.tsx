import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRoomCountdown } from "@/components/contests/useRoomCountdown";

describe("useRoomCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the configured duration while a room is waiting", () => {
    const { result } = renderHook(() =>
      useRoomCountdown("waiting", undefined, 125),
    );

    expect(result.current).toBe("02:05");
  });

  it("derives an active countdown from its absolute start time", () => {
    const { result } = renderHook(() =>
      useRoomCountdown("active", Date.now() - 1_000, 125),
    );

    expect(result.current).toBe("02:04");
  });

  it("never displays a negative duration after completion", () => {
    const { result } = renderHook(() =>
      useRoomCountdown("completed", Date.now() - 300_000, 60),
    );

    expect(result.current).toBe("00:00");
  });
});
