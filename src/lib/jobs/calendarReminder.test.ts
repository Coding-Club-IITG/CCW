import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import CalendarEvent from "@/models/CalendarEvent";
import CalendarReminderDelivery from "@/models/CalendarReminderDelivery";
import Notification from "@/models/Notification";
import User from "@/models/User";
import {
  clearTestMongo,
  startTestMongo,
  stopTestMongo,
} from "../../../tests/utils/mongodb";

describe("calendar reminder job", () => {
  beforeAll(startTestMongo);
  afterEach(clearTestMongo);
  afterAll(stopTestMongo);

  it("notifies only module members once for each due occurrence", async () => {
    const [designMember, otherMember] = await User.create([
      {
        name: "Designer",
        email: "designer@example.test",
        role: "Member",
        moduleRoles: [{ module: "Design", role: "Member" }],
      },
      {
        name: "Other",
        email: "other@example.test",
        role: "Member",
        moduleRoles: [{ module: "Cybersecurity", role: "Member" }],
      },
    ]);
    await CalendarEvent.create({
      title: "Design sync",
      description: "",
      scope: "module",
      module: "Design",
      allDay: false,
      startAt: new Date("2026-08-04T09:00:00.000Z"),
      recurrenceType: "weekly",
      recurrenceCount: 2,
      location: "",
      externalUrl: "",
      agenda: "",
      minutes: "",
      remindOneDayBefore: true,
      createdBy: designMember._id,
    });
    const { sendCalendarReminders } =
      await import("@/lib/jobs/calendarReminder");

    await sendCalendarReminders(new Date("2026-08-03T09:01:00.000Z"));
    await sendCalendarReminders(new Date("2026-08-03T09:02:00.000Z"));

    expect(
      await Notification.find({ userId: String(designMember._id) }).lean(),
    ).toHaveLength(1);
    expect(
      await Notification.find({ userId: String(otherMember._id) }).lean(),
    ).toHaveLength(0);
    expect(await CalendarReminderDelivery.countDocuments()).toBe(1);
  });
});
