import mongoose from "mongoose";
import { expandCalendarOccurrences, getReminderAt } from "@/lib/calendar";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import CalendarEvent from "@/models/CalendarEvent";
import CalendarReminderDelivery from "@/models/CalendarReminderDelivery";
import Notification from "@/models/Notification";
import User from "@/models/User";

const FUTURE_WINDOW_MS = 2 * 366 * 24 * 60 * 60 * 1000;

export async function sendCalendarReminders(now = new Date()) {
  await dbConnect();
  const events = await CalendarEvent.find({
    remindOneDayBefore: true,
    startAt: { $lt: new Date(now.getTime() + FUTURE_WINDOW_MS) },
  }).lean();

  for (const event of events) {
    const occurrences = expandCalendarOccurrences(
      event,
      now,
      new Date(now.getTime() + FUTURE_WINDOW_MS),
    );
    for (const occurrence of occurrences) {
      if (getReminderAt(occurrence.startAt, event.allDay) > now) continue;
      if (
        await CalendarReminderDelivery.exists({
          calendarEventId: event._id,
          occurrenceStart: occurrence.startAt,
          type: "one_day_before",
        })
      )
        continue;

      const userFilter =
        event.scope === "module" ? { "roles.module": event.module } : {};
      const users = await User.find(userFilter).select("_id").lean();
      if (users.length === 0) continue;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await CalendarReminderDelivery.create(
            [
              {
                calendarEventId: event._id,
                occurrenceStart: occurrence.startAt,
                type: "one_day_before",
                sentAt: now,
              },
            ],
            { session },
          );
          await Notification.insertMany(
            users.map((user) => ({
              userId: String(user._id),
              type: "calendar_reminder",
              title: "Calendar event tomorrow",
              message: `“${event.title}” is coming up tomorrow.`,
              link: `/internal/calendar/${event._id}`,
            })),
            { session, ordered: false },
          );
        });
        logger.info("Calendar reminder sent", {
          operation: "send_calendar_reminder",
          calendarEventId: String(event._id),
          occurrenceStart: occurrence.startAt.toISOString(),
          recipientCount: users.length,
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) {
          logger.error("Calendar reminder failed", {
            operation: "send_calendar_reminder",
            calendarEventId: String(event._id),
            ...errorToLogMetadata(error),
          });
        }
      } finally {
        await session.endSession();
      }
    }
  }
}
