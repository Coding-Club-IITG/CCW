import { describe, expect, it } from "vitest";
import {
  buildScheduleFingerprint,
  expandCalendarOccurrences,
  getReminderAt,
  parseCalendarDateTime,
} from "@/lib/calendar";

describe("calendar domain utilities", () => {
  it("stores a timed IST input as UTC", () => {
    expect(parseCalendarDateTime("2026-08-10", "14:30", false)).toEqual(
      new Date("2026-08-10T09:00:00.000Z"),
    );
  });

  it("stores an all-day IST date at the corresponding UTC boundary", () => {
    expect(parseCalendarDateTime("2026-08-10", "", true)).toEqual(
      new Date("2026-08-09T18:30:00.000Z"),
    );
  });

  it("expands only recurring occurrences that overlap the requested range", () => {
    const occurrences = expandCalendarOccurrences(
      {
        startAt: new Date("2026-08-03T04:30:00.000Z"),
        endAt: new Date("2026-08-03T05:30:00.000Z"),
        recurrenceType: "weekly",
        recurrenceCount: 4,
      },
      new Date("2026-08-09T18:30:00.000Z"),
      new Date("2026-08-24T18:30:00.000Z"),
    );

    expect(occurrences).toEqual([
      {
        index: 1,
        startAt: new Date("2026-08-10T04:30:00.000Z"),
        endAt: new Date("2026-08-10T05:30:00.000Z"),
      },
      {
        index: 2,
        startAt: new Date("2026-08-17T04:30:00.000Z"),
        endAt: new Date("2026-08-17T05:30:00.000Z"),
      },
      {
        index: 3,
        startAt: new Date("2026-08-24T04:30:00.000Z"),
        endAt: new Date("2026-08-24T05:30:00.000Z"),
      },
    ]);
  });

  it("notifies timed events exactly 24 hours before", () => {
    expect(getReminderAt(new Date("2026-08-10T09:00:00.000Z"), false)).toEqual(
      new Date("2026-08-09T09:00:00.000Z"),
    );
  });

  it("notifies all-day events at 9 AM IST on the preceding day", () => {
    expect(getReminderAt(new Date("2026-08-09T18:30:00.000Z"), true)).toEqual(
      new Date("2026-08-09T03:30:00.000Z"),
    );
  });

  it("builds a stable fingerprint from public schedule fields", () => {
    const first = buildScheduleFingerprint({
      title: "Weekly Sync",
      scope: "module",
      module: "Design",
      allDay: false,
      startAt: new Date("2026-08-10T09:00:00.000Z"),
      endAt: new Date("2026-08-10T10:00:00.000Z"),
      recurrenceType: "weekly",
      recurrenceCount: 4,
    });
    const second = buildScheduleFingerprint({
      title: "Weekly Sync",
      scope: "module",
      module: "Design",
      allDay: false,
      startAt: new Date("2026-08-10T09:00:00.000Z"),
      endAt: new Date("2026-08-10T10:00:00.000Z"),
      recurrenceType: "weekly",
      recurrenceCount: 4,
    });

    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });
});
