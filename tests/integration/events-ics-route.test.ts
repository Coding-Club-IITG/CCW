import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import CalendarEvent from "@/models/CalendarEvent";
import Event from "@/models/Event";
import mongoose from "mongoose";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../utils/mongodb";

type EventOverrides = Partial<{
  slug: string;
  status: "draft" | "published";
  allDay: boolean;
  recurrenceType: "none" | "daily" | "weekly" | "biweekly" | "monthly";
  recurrenceCount: number;
  publicAudience: string;
}>;

async function seedEvent(overrides: EventOverrides = {}) {
  const calendar = await CalendarEvent.create({
    title: "Winter of Code Kickoff",
    description: "Internal notes",
    scope: "general",
    allDay: false,
    startAt: new Date("2026-09-12T13:30:00.000Z"),
    endAt: new Date("2026-09-12T16:00:00.000Z"),
    recurrenceType: "none",
    recurrenceCount: 1,
    location: "Conference Hall, Core 4",
    externalUrl: "https://internal.example.com/meeting",
    agenda: "Secret agenda item",
    minutes: "Secret minutes",
    remindOneDayBefore: true,
    createdBy: new mongoose.Types.ObjectId(),
  });

  const event = await Event.create({
    title: "Winter of Code Kickoff",
    slug: overrides.slug ?? "winter-of-code-kickoff",
    description: "The long public description.",
    shortDescription: "Project pitches from every module.",
    poster: "/api/events/assets/poster.png",
    startDate: calendar.startAt,
    endDate: calendar.endAt,
    allDay: overrides.allDay ?? false,
    tags: [],
    publicAudience: overrides.publicAudience ?? "Everyone",
    recurrenceType: overrides.recurrenceType ?? "none",
    recurrenceCount: overrides.recurrenceCount ?? 1,
    status: overrides.status ?? "published",
    publishedAt: new Date(),
    calendarEventId: calendar._id,
    scheduleFingerprint: "fingerprint",
  });

  await CalendarEvent.findByIdAndUpdate(calendar._id, {
    publicEventId: event._id,
  });

  return { calendar, event };
}

function request(slug: string) {
  return {
    request: new NextRequest(`http://localhost/api/events/${slug}/ics`),
    context: { params: Promise.resolve({ slug }) },
  };
}

describe("published event iCalendar route", () => {
  beforeAll(startTestMongo);
  afterEach(clearTestMongo);
  afterAll(stopTestMongo);

  it("serves a calendar for a published event", async () => {
    await seedEvent();
    const { GET } = await import("@/app/api/events/[slug]/ics/route");
    const { request: req, context } = request("winter-of-code-kickoff");

    const response = await GET(req, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    expect(response.headers.get("Content-Disposition")).toContain(
      'filename="winter-of-code-kickoff.ics"',
    );

    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:Winter of Code Kickoff");
    expect(body).toContain("DTSTART:20260912T133000Z");
    expect(body).toContain("DTEND:20260912T160000Z");
    expect(body).toContain("LOCATION:Conference Hall\\, Core 4");
    expect(body).toContain(
      "URL:https://codingclub.in/events/winter-of-code-kickoff",
    );
  });

  it("never leaks internal calendar fields", async () => {
    await seedEvent();
    const { GET } = await import("@/app/api/events/[slug]/ics/route");
    const { request: req, context } = request("winter-of-code-kickoff");

    const body = await (await GET(req, context)).text();
    expect(body).not.toContain("Secret agenda item");
    expect(body).not.toContain("Secret minutes");
    expect(body).not.toContain("internal.example.com");
    // The long description stays on the detail page; only the short one ships.
    expect(body).not.toContain("The long public description.");
    expect(body).toContain("DESCRIPTION:Project pitches from every module.");
  });

  it("emits an RRULE for a recurring event", async () => {
    await seedEvent({ recurrenceType: "biweekly", recurrenceCount: 5 });
    const { GET } = await import("@/app/api/events/[slug]/ics/route");
    const { request: req, context } = request("winter-of-code-kickoff");

    const body = await (await GET(req, context)).text();
    expect(body).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=5");
  });

  it("uses date values for an all-day event", async () => {
    await seedEvent({ allDay: true });
    const { GET } = await import("@/app/api/events/[slug]/ics/route");
    const { request: req, context } = request("winter-of-code-kickoff");

    const body = await (await GET(req, context)).text();
    expect(body).toContain("DTSTART;VALUE=DATE:20260912");
  });

  it("refuses a draft event", async () => {
    await seedEvent({ status: "draft" });
    const { GET } = await import("@/app/api/events/[slug]/ics/route");
    const { request: req, context } = request("winter-of-code-kickoff");

    const response = await GET(req, context);
    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown slug", async () => {
    const { GET } = await import("@/app/api/events/[slug]/ics/route");
    const { request: req, context } = request("no-such-event");

    const response = await GET(req, context);
    expect(response.status).toBe(404);
  });
});
