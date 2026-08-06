import mongoose, { Schema, Document, Types } from "mongoose";
import {
  EVENT_PUBLICATION_STATUSES,
  EVENT_RECURRENCE_TYPES,
  PROJECT_MODULES,
  type EventPublicationStatus,
  type EventRecurrenceType,
  type ProjectModuleName,
} from "@/lib/constants";
import type { ImageFocalPoint } from "@/lib/imageFocalPoint";

export interface IEvent extends Document {
  title: string;
  description: string;
  shortDescription: string;
  poster: string;
  posterFocalPoint: ImageFocalPoint;
  startDate: Date;
  endDate?: Date;
  allDay: boolean;
  module?: ProjectModuleName;
  tags: string[];
  recurrenceType: EventRecurrenceType;
  recurrenceCount: number;
  status: EventPublicationStatus;
  publishedAt: Date | null;
  calendarEventId: Types.ObjectId;
  scheduleFingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    shortDescription: { type: String, default: "" },
    poster: { type: String, required: true },
    posterFocalPoint: {
      x: { type: Number, min: 0, max: 1, default: 0.5 },
      y: { type: Number, min: 0, max: 1, default: 0.5 },
      _id: false,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    allDay: { type: Boolean, default: true },
    module: {
      type: String,
      enum: [...PROJECT_MODULES],
    },
    tags: { type: [String], default: [] },
    recurrenceType: {
      type: String,
      enum: [...EVENT_RECURRENCE_TYPES],
      default: "none",
    },
    recurrenceCount: { type: Number, default: 1, min: 1 },
    status: {
      type: String,
      enum: EVENT_PUBLICATION_STATUSES,
      default: "draft",
    },
    publishedAt: { type: Date, default: null },
    calendarEventId: {
      type: Schema.Types.ObjectId,
      ref: "CalendarEvent",
      required: true,
      unique: true,
      sparse: true,
    },
    scheduleFingerprint: { type: String, required: true },
  },
  { timestamps: true },
);

EventSchema.index({ status: 1, startDate: -1 });

export default mongoose.models.Event ||
  mongoose.model<IEvent>("Event", EventSchema);
