/**
 * Minimal iCalendar serializer for published events
 */

import type { EventRecurrenceType } from "@/lib/constants";

export interface IcsEventInput {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  startAt: Date;
  endAt?: Date;
  allDay: boolean;
  recurrenceType?: EventRecurrenceType;
  recurrenceCount?: number;
  now?: Date; // Overridable so tests are deterministic
}

const PRODID = "-//Coding Club IITG//CCW//EN";
const MAX_OCTETS = 75;

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

export function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= MAX_OCTETS) return line;

  const parts: string[] = [];
  let start = 0;
  let limit = MAX_OCTETS;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end -= 1;
    }
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
    limit = MAX_OCTETS - 1;
  }

  return parts.join("\r\n ");
}

export function toIcsUtc(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

export function toIcsDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

const FREQUENCIES: Record<
  Exclude<EventRecurrenceType, "none">,
  { freq: string; interval?: number }
> = {
  daily: { freq: "DAILY" },
  weekly: { freq: "WEEKLY" },
  biweekly: { freq: "WEEKLY", interval: 2 },
  monthly: { freq: "MONTHLY" },
};

export function buildRecurrenceRule(
  recurrenceType: EventRecurrenceType | undefined,
  recurrenceCount: number | undefined,
): string | null {
  if (!recurrenceType || recurrenceType === "none") return null;

  const rule = FREQUENCIES[recurrenceType];
  if (!rule) return null;

  const count = Math.max(1, Math.floor(recurrenceCount ?? 1));
  if (count <= 1) return null;

  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval) parts.push(`INTERVAL=${rule.interval}`);
  parts.push(`COUNT=${count}`);
  return parts.join(";");
}

export function buildEventIcs(input: IcsEventInput): string {
  const {
    uid,
    title,
    description,
    location,
    url,
    startAt,
    endAt,
    allDay,
    recurrenceType,
    recurrenceCount,
    now = new Date(),
  } = input;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${toIcsUtc(now)}`,
  ];

  if (allDay) {
    const end = endAt ?? startAt;
    const exclusiveEnd = new Date(end);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(startAt)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcsDate(exclusiveEnd)}`);
  } else {
    lines.push(`DTSTART:${toIcsUtc(startAt)}`);
    if (endAt) lines.push(`DTEND:${toIcsUtc(endAt)}`);
  }

  const rule = buildRecurrenceRule(recurrenceType, recurrenceCount);
  if (rule) lines.push(`RRULE:${rule}`);

  lines.push(`SUMMARY:${escapeIcsText(title)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (url) lines.push(`URL:${escapeIcsText(url)}`);

  lines.push("END:VEVENT", "END:VCALENDAR");

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
