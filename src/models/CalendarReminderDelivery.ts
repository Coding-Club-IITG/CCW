import mongoose, { Schema, type Document, type Types } from "mongoose";

export interface ICalendarReminderDelivery extends Document {
  calendarEventId: Types.ObjectId;
  occurrenceStart: Date;
  type: "one_day_before";
  sentAt: Date;
}

const CalendarReminderDeliverySchema = new Schema<ICalendarReminderDelivery>(
  {
    calendarEventId: {
      type: Schema.Types.ObjectId,
      ref: "CalendarEvent",
      required: true,
    },
    occurrenceStart: { type: Date, required: true },
    type: {
      type: String,
      enum: ["one_day_before"],
      default: "one_day_before",
      required: true,
    },
    sentAt: { type: Date, default: Date.now, required: true },
  },
  { timestamps: false },
);

CalendarReminderDeliverySchema.index(
  { calendarEventId: 1, occurrenceStart: 1, type: 1 },
  { unique: true },
);

export default mongoose.models.CalendarReminderDelivery ||
  mongoose.model<ICalendarReminderDelivery>(
    "CalendarReminderDelivery",
    CalendarReminderDeliverySchema,
  );
