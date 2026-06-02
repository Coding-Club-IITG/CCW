/**
 * Shared constants
 */

export const MODULES = [
  "Software Development",
  "Competitive Programming",
  "Machine Learning",
  "Cybersecurity",
  "Design",
] as const;

export type ModuleName = (typeof MODULES)[number];

export const PROJECT_MODULES = [...MODULES, "General"] as const;
export type ProjectModuleName = (typeof PROJECT_MODULES)[number];

export const LEADERSHIP_ROLES = ["Secretary", "OC", "Projects Head"] as const;
export type LeadershipRole = (typeof LEADERSHIP_ROLES)[number];

export const TEAM_ROLES = [...LEADERSHIP_ROLES, "Head"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const GLOBAL_ROLES = [...TEAM_ROLES, "Core Team", "Member"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const MODULE_ROLES = [
  "Senior Coordinator",
  "Coordinator",
  "Member",
] as const;
export type ModuleRoleType = (typeof MODULE_ROLES)[number];

export const PROJECT_STATUSES = ["Upcoming", "Ongoing", "Completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const EVENT_STATUSES = ["Upcoming", "Ongoing", "Completed"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_RECURRENCE_TYPES = [
  "none",
  "daily",
  "weekly",
  "biweekly",
  "monthly",
] as const;
export type EventRecurrenceType = (typeof EVENT_RECURRENCE_TYPES)[number];

/* CP Platforms */

export const PLATFORMS = ["codeforces", "atcoder"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_DISPLAY_NAMES: Record<Platform, string> = {
  codeforces: "Codeforces",
  atcoder: "AtCoder",
};

export const PLATFORM_PROFILE_URLS: Record<
  Platform,
  (handle: string) => string
> = {
  codeforces: (handle) => `https://codeforces.com/profile/${handle}`,
  atcoder: (handle) => `https://atcoder.jp/users/${handle}`,
};

export const PLATFORM_PROBLEM_URLS: Record<
  Platform,
  (contestId: string, problemIndex: string) => string
> = {
  codeforces: (contestId, index) =>
    `https://codeforces.com/problemset/problem/${contestId}/${index}`,
  atcoder: (contestId, index) =>
    `https://atcoder.jp/contests/${contestId}/tasks/${index}`,
};

/* Contest Platforms */

export const CONTEST_PLATFORMS = [
  "codeforces",
  "atcoder",
  "codechef",
  "leetcode",
] as const;
export type ContestPlatform = (typeof CONTEST_PLATFORMS)[number];

export const CONTEST_PLATFORM_DISPLAY_NAMES: Record<ContestPlatform, string> = {
  codeforces: "Codeforces",
  atcoder: "AtCoder",
  codechef: "CodeChef",
  leetcode: "LeetCode",
};

/* POTD */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Offset from UTC to IST in ms

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Easy: "#10b981",
  Medium: "#f59e0b",
  Hard: "#e11d48",
};

export const DIFFICULTY_ORDER: Record<Difficulty, number> = {
  Easy: 0,
  Medium: 1,
  Hard: 2,
};

/* Hackathons */

export const HACKATHON_STATUSES = ["active", "archived"] as const;
export type HackathonStatus = (typeof HACKATHON_STATUSES)[number];

export const HACKATHON_TEAM_STATUSES = ["open", "full", "closed"] as const;
export type HackathonTeamStatus = (typeof HACKATHON_TEAM_STATUSES)[number];

export const HACKATHON_REQUEST_TYPES = ["join_request", "invite"] as const;
export type HackathonRequestType = (typeof HACKATHON_REQUEST_TYPES)[number];

export const HACKATHON_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "rejected",
] as const;
export type HackathonRequestStatus =
  (typeof HACKATHON_REQUEST_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  "team_invite",
  "join_request",
  "request_accepted",
  "request_rejected",
  "team_removed",
  "team_deleted",
  "hackathon_reminder",
  "potd_reminder",
  "announcement",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/* Blog */

export const BLOG_STATUSES = ["draft", "published"] as const;
export type BlogStatus = (typeof BLOG_STATUSES)[number];

export const BLOG_TAGS = [
  ...MODULES,
  "General",
  "Tutorial",
  "Event Recap",
  "Announcement",
] as const;
export type BlogTag = (typeof BLOG_TAGS)[number];

// Image upload constants
export const ALLOWED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
] as const;
export type ImageExtension = (typeof ALLOWED_IMAGE_EXTENSIONS)[number];

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
] as const;
export type ImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const IMAGE_EXTENSION_TO_MIME: Record<ImageExtension, ImageMimeType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

/**
 * Regex fragment matching allowed image extensions
 * For use in filename validation
 * */
export const IMAGE_EXTENSIONS_REGEX_FRAGMENT = ALLOWED_IMAGE_EXTENSIONS.map(
  (e) => e.slice(1),
).join("|");
