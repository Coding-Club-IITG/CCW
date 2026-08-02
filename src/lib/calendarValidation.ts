import {
  CALENDAR_SCOPES,
  EVENT_RECURRENCE_TYPES,
  MODULES,
  type CalendarScope,
  type EventRecurrenceType,
  type ModuleName,
} from "@/lib/constants";
import { parseCalendarDateTime } from "@/lib/calendar";

export interface CalendarEventInput {
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
}

type ValidationResult =
  | { success: true; data: CalendarEventInput }
  | { success: false; error: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseCalendarEventInput(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { success: false, error: "Invalid calendar event data." };
  }
  const input = raw as Record<string, unknown>;
  const title = text(input.title);
  const description = text(input.description);
  const location = text(input.location);
  const externalUrl = text(input.externalUrl);
  const agenda = text(input.agenda);
  const minutes = text(input.minutes);
  const scope = text(input.scope) as CalendarScope;
  const selectedModule = text(input.module) as ModuleName;
  const recurrenceType = (text(input.recurrenceType) ||
    "none") as EventRecurrenceType;
  const recurrenceCount = Number(input.recurrenceCount ?? 1);
  const allDay = input.allDay === true;

  if (!title) return { success: false, error: "Title is required." };
  if (title.length > 200)
    return { success: false, error: "Title must be 200 characters or fewer." };
  if (
    description.length > 20_000 ||
    agenda.length > 20_000 ||
    minutes.length > 20_000
  ) {
    return {
      success: false,
      error: "Text fields must be 20,000 characters or fewer.",
    };
  }
  if (!CALENDAR_SCOPES.includes(scope)) {
    return { success: false, error: "Select a valid event scope." };
  }
  if (scope === "module" && !MODULES.includes(selectedModule)) {
    return { success: false, error: "Select a valid module." };
  }
  if (!EVENT_RECURRENCE_TYPES.includes(recurrenceType)) {
    return { success: false, error: "Select a valid recurrence type." };
  }
  if (
    !Number.isInteger(recurrenceCount) ||
    recurrenceCount < 1 ||
    recurrenceCount > 52
  ) {
    return {
      success: false,
      error: "Occurrence count must be between 1 and 52.",
    };
  }
  if (location.length > 500 || externalUrl.length > 2_000) {
    return { success: false, error: "Location or URL is too long." };
  }
  if (externalUrl) {
    try {
      const url = new URL(externalUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error();
    } catch {
      return { success: false, error: "Enter a valid HTTP or HTTPS URL." };
    }
  }

  const startAt = parseCalendarDateTime(
    text(input.startDate),
    text(input.startTime),
    allDay,
  );
  if (!startAt)
    return { success: false, error: "Enter a valid start date and time." };

  const endDate = text(input.endDate);
  const endTime = text(input.endTime);
  const parsedEndAt = endDate
    ? parseCalendarDateTime(endDate, endTime, allDay)
    : undefined;
  if (endDate && !parsedEndAt) {
    return { success: false, error: "Enter a valid end date and time." };
  }
  const endAt = parsedEndAt ?? undefined;
  if (endAt && endAt < startAt) {
    return {
      success: false,
      error: "End date and time cannot be earlier than the start.",
    };
  }

  return {
    success: true,
    data: {
      title,
      description,
      scope,
      module: scope === "module" ? selectedModule : undefined,
      allDay,
      startAt,
      endAt,
      recurrenceType,
      recurrenceCount: recurrenceType === "none" ? 1 : recurrenceCount,
      location,
      externalUrl,
      agenda,
      minutes,
      remindOneDayBefore: input.remindOneDayBefore === true,
    },
  };
}
