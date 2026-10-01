import { afterEach, describe, expect, it, vi } from "vitest";

import { computeEffectiveEndDate, getEventStatus } from "./status";

const originalTimezone = process.env.TZ;
afterEach(() => {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
  vi.useRealTimers();
});

describe.each(["UTC", "Asia/Kolkata", "America/New_York"])(
  "event dates on a %s host",
  (timezone) => {
    it("compares IST calendar days once around midnight", () => {
      process.env.TZ = timezone;
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-31T14:00:00Z"));
      expect(getEventStatus("2026-07-31T19:00:00Z")).toBe("Upcoming");
      vi.setSystemTime(new Date("2026-07-31T18:30:00Z"));
      expect(getEventStatus("2026-07-31T19:00:00Z")).toBe("Ongoing");
      vi.setSystemTime(new Date("2026-08-01T18:30:00Z"));
      expect(getEventStatus("2026-07-31T19:00:00Z")).toBe("Completed");
    });

    it("keeps an explicit end day inclusive in IST", () => {
      process.env.TZ = timezone;
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-01T18:29:59Z"));
      expect(
        getEventStatus("2026-07-30T10:00:00Z", "2026-08-01T01:00:00Z"),
      ).toBe("Ongoing");
      vi.setSystemTime(new Date("2026-08-01T18:30:00Z"));
      expect(
        getEventStatus("2026-07-30T10:00:00Z", "2026-08-01T01:00:00Z"),
      ).toBe("Completed");
    });

    it("does not change recurrence times across a host daylight-saving transition", () => {
      process.env.TZ = timezone;
      expect(
        computeEffectiveEndDate(
          "2026-03-07T14:00:00Z",
          "daily",
          3,
        ).toISOString(),
      ).toBe("2026-03-09T14:00:00.000Z");
      expect(
        computeEffectiveEndDate(
          "2026-03-07T14:00:00Z",
          "weekly",
          2,
        ).toISOString(),
      ).toBe("2026-03-14T14:00:00.000Z");
      expect(
        computeEffectiveEndDate(
          "2026-03-07T14:00:00Z",
          "biweekly",
          2,
        ).toISOString(),
      ).toBe("2026-03-21T14:00:00.000Z");
      expect(
        computeEffectiveEndDate(
          "2026-03-07T14:00:00Z",
          "monthly",
          2,
        ).toISOString(),
      ).toBe("2026-04-07T14:00:00.000Z");
    });

    it("uses the recurrence end day when no explicit end is set", () => {
      process.env.TZ = timezone;
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-01T14:00:00Z"));
      expect(
        getEventStatus("2026-07-31T19:00:00Z", undefined, "daily", 2),
      ).toBe("Ongoing");
      expect(
        computeEffectiveEndDate("2026-07-31T19:00:00Z").toISOString(),
      ).toBe("2026-07-31T19:00:00.000Z");
    });
  },
);
