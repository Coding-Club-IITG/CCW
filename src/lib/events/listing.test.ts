import { describe, expect, it } from "vitest";

import {
  ARCHIVE_STEP,
  archiveShown,
  eventView,
  eventsHref,
  groupByMonth,
  istDay,
  istMonthKey,
  istMonthLabel,
  istTime,
  recurrenceLabel,
} from "./listing";

describe("eventView", () => {
  it("defaults to the posters grid", () => {
    expect(eventView(undefined)).toBe("posters");
    expect(eventView("nonsense")).toBe("posters");
  });

  it("accepts the timeline", () => {
    expect(eventView("timeline")).toBe("timeline");
  });
});

describe("archiveShown", () => {
  it("starts at one step", () => {
    expect(archiveShown(undefined, 100)).toBe(ARCHIVE_STEP);
    expect(archiveShown("", 100)).toBe(ARCHIVE_STEP);
  });

  it("never exceeds the number of archived events", () => {
    expect(archiveShown("96", 5)).toBe(5);
    expect(archiveShown(undefined, 3)).toBe(3);
  });

  it("rounds a hand-edited value up to a whole step", () => {
    expect(archiveShown("13", 100)).toBe(24);
    expect(archiveShown("24", 100)).toBe(24);
  });

  it("ignores values below one step or that are not numbers", () => {
    expect(archiveShown("-5", 100)).toBe(ARCHIVE_STEP);
    expect(archiveShown("abc", 100)).toBe(ARCHIVE_STEP);
    expect(archiveShown("1e99", 100)).toBe(ARCHIVE_STEP);
  });
});

describe("eventsHref", () => {
  it("returns the bare archive for the default state", () => {
    expect(eventsHref({})).toBe("/events");
    expect(eventsHref({ view: "posters", show: "12" })).toBe("/events");
  });

  it("carries the other filters through a change", () => {
    expect(eventsHref({ module: "Design" }, { view: "timeline" })).toBe(
      "/events?module=Design&view=timeline",
    );
  });

  it("encodes module names with spaces", () => {
    expect(eventsHref({ module: "Machine Learning" })).toBe(
      "/events?module=Machine+Learning",
    );
  });

  it("keeps an expanded archive window", () => {
    expect(eventsHref({}, { show: "24" })).toBe("/events?show=24");
  });
});

describe("IST formatting", () => {
  // 2026-09-12T18:30Z is 2026-09-13T00:00 IST, so the date rolls over.
  const crossesMidnight = "2026-09-12T18:30:00.000Z";

  it("formats the day in IST, not UTC", () => {
    expect(istDay(crossesMidnight)).toBe("13");
    expect(istDay("2026-09-12T13:30:00.000Z")).toBe("12");
  });

  it("formats the start time in IST", () => {
    expect(istTime("2026-09-12T13:30:00.000Z", false)).toBe("7:00 pm");
  });

  it("labels all-day events instead of showing a time", () => {
    expect(istTime("2026-09-12T13:30:00.000Z", true)).toBe("All day");
  });

  it("derives the month bucket in IST", () => {
    expect(istMonthKey("2026-09-30T18:30:00.000Z")).toBe("2026-10");
    // ICU abbreviates September as "Sept".
    expect(istMonthLabel("2026-09-12T13:30:00.000Z")).toBe("Sept 2026");
    expect(istMonthLabel("2026-08-09T13:30:00.000Z")).toBe("Aug 2026");
  });
});

describe("groupByMonth", () => {
  it("buckets events by month, preserving order", () => {
    const groups = groupByMonth([
      { startDate: "2026-09-12T13:30:00.000Z", id: "a" },
      { startDate: "2026-09-20T13:30:00.000Z", id: "b" },
      { startDate: "2026-08-09T13:30:00.000Z", id: "c" },
    ]);
    expect(groups.map((group) => group.key)).toEqual(["2026-09", "2026-08"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups[1].label).toBe("Aug 2026");
  });

  it("returns nothing for an empty list", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe("recurrenceLabel", () => {
  it("is absent for a one-off event", () => {
    expect(recurrenceLabel("none", 1)).toBeNull();
    expect(recurrenceLabel(undefined, 3)).toBeNull();
  });

  it("describes each cadence", () => {
    expect(recurrenceLabel("weekly", 5)).toBe("Weekly · 5 occurrences");
    expect(recurrenceLabel("biweekly", 4)).toBe(
      "Every 2 weeks · 4 occurrences",
    );
    expect(recurrenceLabel("monthly", 1)).toBe("Monthly · 1 occurrence");
  });
});
