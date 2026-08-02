import { describe, expect, it } from "vitest";
import CalendarEvent from "@/models/CalendarEvent";
import CalendarReminderDelivery from "@/models/CalendarReminderDelivery";
import Event from "@/models/Event";

describe("calendar persistence schemas", () => {
  it("requires explicit calendar scope and schedule fields", () => {
    expect(CalendarEvent.schema.path("scope").isRequired).toBe(true);
    expect(CalendarEvent.schema.path("startAt").isRequired).toBe(true);
    expect(CalendarEvent.schema.path("allDay").options.default).toBe(false);
    expect(
      CalendarEvent.schema.path("remindOneDayBefore").options.default,
    ).toBe(false);
  });

  it("enforces one public event per calendar event", () => {
    const calendarEventPath = Event.schema.path("calendarEventId");
    expect(calendarEventPath.options.required).toBe(true);
    expect(calendarEventPath.options.unique).toBe(true);
    expect(Event.schema.path("status").options.default).toBe("draft");
  });

  it("deduplicates reminder deliveries by occurrence", () => {
    expect(CalendarReminderDelivery.schema.indexes()).toContainEqual([
      { calendarEventId: 1, occurrenceStart: 1, type: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });
});
