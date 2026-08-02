import { describe, expect, it } from "vitest";
import { formatEventDate } from "@/lib/eventDate";

describe("formatEventDate", () => {
  it("formats timed dates restored from the JSON cache", () => {
    expect(
      formatEventDate(
        "2026-06-01T14:30:00.000Z",
        "2026-06-01T16:30:00.000Z",
        false,
      ),
    ).toContain("8:00 pm");
  });

  it("does not throw when legacy cached data contains an invalid date", () => {
    expect(formatEventDate("not-a-date", undefined, false)).toBe(
      "Date unavailable",
    );
  });
});
