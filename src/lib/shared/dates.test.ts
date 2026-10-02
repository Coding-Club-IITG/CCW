import { describe, expect, it } from "vitest";

import {
  formatDateInput,
  formatDateTimeInput,
  parseDateTimeInput,
} from "./dates";

describe("IST date inputs", () => {
  it("changes calendar days at midnight in IST", () => {
    expect(formatDateInput("2026-10-02T18:29:59.999Z")).toBe("2026-10-02");
    expect(formatDateInput("2026-10-02T18:30:00.000Z")).toBe("2026-10-03");
    expect(formatDateInput("2026-10-03T18:29:59.999Z")).toBe("2026-10-03");
    expect(formatDateInput("2026-10-03T18:30:00.000Z")).toBe("2026-10-04");
  });

  it("keeps ISO date ordering across month and year boundaries", () => {
    const dates = [
      "2026-12-31T18:30:00Z",
      "2026-12-31T18:29:59Z",
      "2026-01-31T18:30:00Z",
    ];
    expect(dates.map(formatDateInput).sort()).toEqual([
      "2026-02-01",
      "2026-12-31",
      "2027-01-01",
    ]);
    expect(formatDateInput(new Date(dates[0]))).toBe("2027-01-01");
  });
});

describe("IST schedule fields", () => {
  it("round-trips midnight and daytime schedules as UTC", () => {
    expect(formatDateTimeInput("2026-10-02T18:30:00Z")).toBe(
      "2026-10-03T00:00",
    );
    expect(parseDateTimeInput("2026-10-03T00:00")?.toISOString()).toBe(
      "2026-10-02T18:30:00.000Z",
    );
    expect(parseDateTimeInput("2026-10-03T14:15")?.toISOString()).toBe(
      "2026-10-03T08:45:00.000Z",
    );
  });

  it("rejects incomplete fields and impossible calendar dates", () => {
    for (const value of [
      "",
      "2026-10-03",
      "2026-02-30T12:00",
      "2026-10-03T24:00",
      "2026-10-03T12:60",
    ])
      expect(parseDateTimeInput(value)).toBeNull();
  });
});
