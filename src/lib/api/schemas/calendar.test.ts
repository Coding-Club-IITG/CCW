import { describe, expect, it } from "vitest";
import { parseCalendarEventInput } from "@/lib/api/schemas/calendar";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Design review",
    description: "Review the final assets.",
    scope: "module",
    module: "Design",
    allDay: false,
    startDate: "2026-08-10",
    startTime: "14:30",
    endDate: "2026-08-10",
    endTime: "15:30",
    recurrenceType: "weekly",
    recurrenceCount: 3,
    location: "Conference room",
    externalUrl: "https://meet.example.test/review",
    agenda: "## Agenda",
    minutes: "",
    remindOneDayBefore: true,
    ...overrides,
  };
}

describe("calendar input validation", () => {
  it("parses a complete timed event", () => {
    const result = parseCalendarEventInput(validInput());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.startAt).toEqual(new Date("2026-08-10T09:00:00.000Z"));
    expect(result.data.endAt).toEqual(new Date("2026-08-10T10:00:00.000Z"));
  });

  it("requires a module for module-scoped events", () => {
    expect(parseCalendarEventInput(validInput({ module: "" }))).toEqual({
      success: false,
      error: "Select a valid module.",
    });
  });

  it("rejects an end before the start", () => {
    expect(
      parseCalendarEventInput(
        validInput({ endDate: "2026-08-10", endTime: "13:30" }),
      ),
    ).toEqual({
      success: false,
      error: "End date and time cannot be earlier than the start.",
    });
  });

  it("rejects invalid external URLs", () => {
    expect(
      parseCalendarEventInput(
        validInput({ externalUrl: "javascript:alert(1)" }),
      ),
    ).toEqual({ success: false, error: "Enter a valid HTTP or HTTPS URL." });
  });

  it("rejects calendar dates that JavaScript would normalize", () => {
    expect(
      parseCalendarEventInput(validInput({ startDate: "2026-02-31" })),
    ).toEqual({
      success: false,
      error: "Enter a valid start date and time.",
    });
  });
});
