import { afterEach, describe, expect, it, vi } from "vitest";

import {
  computeWindowTimes,
  formatDate,
  getAvailableDates,
  getTodayISTDateStr,
  windowStartToISTDateStr,
} from "@/lib/potd/schedule";

afterEach(() => {
  vi.useRealTimers();
});

describe("POTD challenge windows", () => {
  it("maps an IST challenge date to its exact UTC main and grace boundaries", () => {
    expect(computeWindowTimes("2026-07-30")).toEqual({
      windowStart: new Date("2026-07-29T18:30:00.000Z"),
      windowEnd: new Date("2026-07-30T18:29:59.999Z"),
      graceEnd: new Date("2026-07-30T20:29:59.999Z"),
    });
  });

  it("round-trips a challenge window start to its IST date", () => {
    expect(windowStartToISTDateStr(new Date("2026-07-29T18:30:00.000Z"))).toBe(
      "2026-07-30",
    );
  });

  it("uses the IST calendar date across the UTC day boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T20:00:00.000Z"));

    expect(getTodayISTDateStr()).toBe("2026-07-31");
    expect(getAvailableDates()).toHaveLength(11);
    expect(getAvailableDates().at(0)).toBe("2026-07-31");
    expect(getAvailableDates().at(-1)).toBe("2026-08-10");
  });

  it("formats date labels independently of the machine timezone", () => {
    expect(formatDate("2026-07-30", "long")).toBe("Thursday, Jul 30");
  });
});
