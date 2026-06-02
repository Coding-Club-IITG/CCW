import mongoose, { Schema, Document } from "mongoose";
import {
  EVENT_RECURRENCE_TYPES,
  PROJECT_MODULES,
  type EventRecurrenceType,
  type ProjectModuleName,
} from "@/lib/constants";

export interface IEvent extends Document {
  title: string;
  description: string;
  shortDescription: string;
  poster: string;
  startDate: Date;
  endDate?: Date;
  module?: ProjectModuleName;
  tags: string[];
  recurrenceType: EventRecurrenceType;
  recurrenceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    shortDescription: { type: String, default: "" },
    poster: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
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
  },
  { timestamps: true },
);

export default mongoose.models.Event ||
  mongoose.model<IEvent>("Event", EventSchema);
