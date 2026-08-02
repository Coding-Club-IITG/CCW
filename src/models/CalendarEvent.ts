import mongoose, { Schema, type Document, type Types } from "mongoose";
import {
  CALENDAR_SCOPES,
  EVENT_RECURRENCE_TYPES,
  MODULES,
  type CalendarScope,
  type EventRecurrenceType,
  type ModuleName,
} from "@/lib/constants";

export interface ICalendarEvent extends Document {
  title: string;
  description: string;
  scope: CalendarScope;
  module?: ModuleName;
  allDay: boolean;
  startAt: Date;
  endAt?: Date;
  recurrenceType: EventRecurrenceType;
  recurrenceCount: number;
  location: string;
  externalUrl: string;
  agenda: string;
  minutes: string;
  remindOneDayBefore: boolean;
  createdBy: Types.ObjectId;
  publicEventId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CalendarEventSchema = new Schema<ICalendarEvent>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", maxlength: 20_000 },
    scope: { type: String, enum: CALENDAR_SCOPES, required: true },
    module: { type: String, enum: MODULES },
    allDay: { type: Boolean, default: false },
    startAt: { type: Date, required: true },
    endAt: { type: Date },
    recurrenceType: {
      type: String,
      enum: EVENT_RECURRENCE_TYPES,
      default: "none",
    },
    recurrenceCount: { type: Number, default: 1, min: 1, max: 52 },
    location: { type: String, default: "", maxlength: 500 },
    externalUrl: { type: String, default: "", maxlength: 2_000 },
    agenda: { type: String, default: "", maxlength: 20_000 },
    minutes: { type: String, default: "", maxlength: 20_000 },
    remindOneDayBefore: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publicEventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true },
);

CalendarEventSchema.index({ startAt: 1 });
CalendarEventSchema.index({ scope: 1, module: 1, startAt: 1 });

CalendarEventSchema.pre("validate", function validateScope() {
  if (this.scope === "module" && !this.module) {
    this.invalidate("module", "Module is required for module events.");
  }
  if (this.scope === "general") this.module = undefined;
});

export default mongoose.models.CalendarEvent ||
  mongoose.model<ICalendarEvent>("CalendarEvent", CalendarEventSchema);
