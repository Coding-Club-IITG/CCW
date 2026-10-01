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
