import type {
  CalendarScope,
  EventRecurrenceType,
  ModuleName,
} from "@/lib/constants";

export interface CalendarOccurrenceView {
  index: number;
  startAt: string;
  endAt?: string;
}

export interface CalendarEventView {
  _id: string;
  title: string;
  scope: CalendarScope;
  module?: ModuleName;
  allDay: boolean;
  startAt: string;
  endAt?: string;
  recurrenceType: EventRecurrenceType;
  recurrenceCount: number;
  location: string;
  publicEventId?: string | null;
  occurrences: CalendarOccurrenceView[];
}
