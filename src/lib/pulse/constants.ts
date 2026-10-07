export const PULSE_QUIZ_STATUSES = [
  "draft",
  "scheduled",
  "lobby_open",
  "live",
  "paused",
  "interaction_locked",
  "completed",
  "cancelled",
  "archived",
] as const;
export type PulseQuizStatus = (typeof PULSE_QUIZ_STATUSES)[number];
export const PULSE_QUIZ_DEFAULT_STATUS: PulseQuizStatus = "draft";

export const PULSE_HOST_ROLES = ["owner", "cohost"] as const;
export type PulseHostRole = (typeof PULSE_HOST_ROLES)[number];

export const PULSE_DELIVERY_MODES = [
  "host-paced",
  "participant-paced",
] as const;
export const PULSE_NAVIGATION_MODES = ["sequential", "free"] as const;
export const PULSE_SLIDE_TYPES = ["info", "mcq", "qa"] as const;

export const PULSE_DEFAULT_MAX_PARTICIPANTS = 500;
export const PULSE_DEFAULT_ALLOW_LATE_JOIN = false;

/* ---------- Room code ---------- */

// 31 characters: A-Z and 2-9, minus 0/O, 1/I/L
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_MAX_ATTEMPTS = 5;
export const ROOM_CODE_PATTERN = new RegExp(
  `^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`,
);

/* ---------- Audit ---------- */

export const PULSE_AUDIT_EVENT_TYPES = [
  "quiz.created",
  "host.assigned",
  "host.removed",
  "host.linked",
] as const;
export type PulseAuditEventType = (typeof PULSE_AUDIT_EVENT_TYPES)[number];

// Issue doesn't specify the actor roles, so this is an assumption to confirm.
export const PULSE_AUDIT_ACTOR_ROLES = [
  "owner",
  "cohost",
  "admin",
  "system",
] as const;
export type PulseAuditActorRole = (typeof PULSE_AUDIT_ACTOR_ROLES)[number];

// Metadata keys rejected so secrets can't be stored in audit events
export const PULSE_AUDIT_FORBIDDEN_METADATA_KEY =
  /token|secret|password|hash|cookie|authorization|credential|api[-_]?key/i;

/* ---------- Display maps ---------- */

/** Sentence-case labels for each quiz status, suitable for UI badges. */
export const PULSE_STATUS_LABELS: Record<PulseQuizStatus, string> = {
  draft:              "Draft",
  scheduled:          "Scheduled",
  lobby_open:         "Lobby open",
  live:               "Live",
  paused:             "Paused",
  interaction_locked: "Interaction locked",
  completed:          "Completed",
  cancelled:          "Cancelled",
  archived:           "Archived",
};

/* ---------- Error messages ---------- */

/** Shape of the error object returned inside an AppResult failure. */
export interface PulseAppError {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
}

/**
 * Maps a Pulse API error to a safe, user-friendly string.
 *
 * Special cases:
 * - CONFLICT: returns the server's own message (specific and safe, e.g.
 *   "The owner is permanent and cannot be changed.").
 * - VALIDATION_ERROR: returns the first field-level message when present,
 *   otherwise the server's top-level message.
 */
export function pulseErrorMessage(error: PulseAppError): string {
  switch (error.code) {
    case "PULSE_NOT_AUTHORIZED":
      return "Sign in to use Pulse.";
    case "PULSE_NOT_HOST":
      return "You don't have a host assignment for this quiz.";
    case "PULSE_QUIZ_NOT_FOUND":
      return "This quiz could not be found.";
    case "CONFLICT":
      return error.message;
    case "VALIDATION_ERROR": {
      const firstField = error.fields
        ? Object.values(error.fields).find((msgs) => msgs.length > 0)
        : undefined;
      return firstField?.[0] ?? error.message;
    }
    case "NOT_FOUND":
      return "Co-host assignment not found.";
    case "SERVICE_UNAVAILABLE":
      return "Something went wrong. Please try again.";
    default:
      return "An unexpected error occurred. Please try again.";
  }
}
