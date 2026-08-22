import { APP_TIME_ZONE } from "@/lib/constants";

export const AGENDA_SCHEDULE_OPTIONS = {
  timezone: APP_TIME_ZONE,
} as const;

export const NIGHTLY_CF_PROBLEM_SCHEDULE = {
  pattern: "0 2 * * *",
  tz: APP_TIME_ZONE,
} as const;

export const AGENDA_JOB_SCHEDULES = [
  { interval: "6 hours", name: "sync-cf-ratings" },
  { interval: "6 hours", name: "sync-ac-ratings" },
  { interval: "0 5 2 * * *", name: "sync-potd-submissions" },
  { interval: "3 hours", name: "sync-contests" },
  { interval: "0 0 3 * * 0", name: "cleanup-images" },
  { interval: "1 hour", name: "hackathon-deadline-reminders" },
  { interval: "1 hour", name: "potd-reminders" },
  { interval: "15 minutes", name: "calendar-reminders" },
] as const;
