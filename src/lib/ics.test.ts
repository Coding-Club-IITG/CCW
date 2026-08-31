import { describe, expect, it } from "vitest";

import {
  buildEventIcs,
  buildRecurrenceRule,
  escapeIcsText,
  foldIcsLine,
  toIcsDate,
  toIcsUtc,
} from "./ics";

const NOW = new Date("2026-08-31T10:00:00.000Z");

describe("escapeIcsText", () => {
  it("escapes the four reserved sequences", () => {
    expect(escapeIcsText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("normalizes CRLF and CR to the escaped newline", () => {
    expect(escapeIcsText("a\r\nb\rc")).toBe("a\\nb\\nc");
  });

  it("escapes the backslash before the delimiters it introduces", () => {
    expect(escapeIcsText(";")).toBe("\\;");
    expect(escapeIcsText("\\;")).toBe("\\\\\\;");
  });
});

describe("foldIcsLine", () => {
  it("leaves a line of 75 octets or fewer alone", () => {
    const line = "X".repeat(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it("folds longer lines with a leading space on continuations", () => {
    const folded = foldIcsLine("Y".repeat(200));
    const parts = folded.split("\r\n");
    expect(parts[0]).toHaveLength(75);
    expect(parts.slice(1).every((part) => part.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe("Y".repeat(200));
  });

  it("never splits a multi-byte character across a fold", () => {
    const folded = foldIcsLine("é".repeat(80));
    for (const part of folded.split("\r\n")) {
      expect(part.replace(/^ /, "")).not.toContain("�");
    }
    expect(folded.replace(/\r\n /g, "")).toBe("é".repeat(80));
  });
});

describe("timestamp helpers", () => {
  it("formats UTC timestamps without punctuation", () => {
    expect(toIcsUtc(new Date("2026-09-12T13:30:00.000Z"))).toBe(
      "20260912T133000Z",
    );
  });

  it("formats date-only values", () => {
    expect(toIcsDate(new Date("2026-09-12T13:30:00.000Z"))).toBe("20260912");
  });
});

describe("buildRecurrenceRule", () => {
  it("returns null when the event does not repeat", () => {
    expect(buildRecurrenceRule("none", 5)).toBeNull();
    expect(buildRecurrenceRule(undefined, 5)).toBeNull();
  });

  it("returns null for a single occurrence", () => {
    expect(buildRecurrenceRule("weekly", 1)).toBeNull();
  });

  it("maps each recurrence type, using INTERVAL for biweekly", () => {
    expect(buildRecurrenceRule("daily", 3)).toBe("FREQ=DAILY;COUNT=3");
    expect(buildRecurrenceRule("weekly", 5)).toBe("FREQ=WEEKLY;COUNT=5");
    expect(buildRecurrenceRule("biweekly", 4)).toBe(
      "FREQ=WEEKLY;INTERVAL=2;COUNT=4",
    );
    expect(buildRecurrenceRule("monthly", 6)).toBe("FREQ=MONTHLY;COUNT=6");
  });
});

describe("buildEventIcs", () => {
  const base = {
    uid: "winter-of-code-kickoff",
    title: "Winter of Code Kickoff",
    startAt: new Date("2026-09-12T13:30:00.000Z"),
    endAt: new Date("2026-09-12T16:00:00.000Z"),
    allDay: false,
    now: NOW,
  };

  it("emits a well-formed timed VEVENT with CRLF endings", () => {
    const ics = buildEventIcs(base);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20260912T133000Z");
    expect(ics).toContain("DTEND:20260912T160000Z");
    expect(ics).toContain("DTSTAMP:20260831T100000Z");
    expect(ics).toContain("SUMMARY:Winter of Code Kickoff");
    expect(ics).not.toContain("RRULE");
  });

  it("uses exclusive date values for an all-day event", () => {
    const ics = buildEventIcs({ ...base, allDay: true, endAt: undefined });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260912");
    // DTEND is exclusive, so a one-day event ends on the 13th.
    expect(ics).toContain("DTEND;VALUE=DATE:20260913");
  });

  it("includes an RRULE for a repeating event", () => {
    const ics = buildEventIcs({
      ...base,
      recurrenceType: "biweekly",
      recurrenceCount: 5,
    });
    expect(ics).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=5");
  });

  it("escapes reserved characters in free text", () => {
    const ics = buildEventIcs({
      ...base,
      location: "Conference Hall, Core 4",
      description: "Pitches; then team forming.\nBring a laptop.",
    });
    expect(ics).toContain("LOCATION:Conference Hall\\, Core 4");
    expect(ics).toContain(
      "DESCRIPTION:Pitches\\; then team forming.\\nBring a laptop.",
    );
  });

  it("omits optional properties that were not supplied", () => {
    const ics = buildEventIcs(base);
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("DESCRIPTION:");
    expect(ics).not.toContain("URL:");
  });
});
