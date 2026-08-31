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

export const CURRENT_TENURE = "2026-27";

export const APP_TIME_ZONE = "Asia/Kolkata";

export const ACCESS_LEVELS = ["Member", "Head", "Admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const AUDIT_CATEGORIES = [
  "users",
  "blog",
  "projects",
  "events",
  "calendar",
  "files",
  "notifications",
  "credits",
  "hackathons",
  "contests",
  "potd",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const AUDIT_ACTIONS = [
  "create",
  "update",
  "delete",
  "publish",
  "upload",
  "broadcast",
  "schedule",
  "bulk_schedule",
  "sync",
  "status_change",
  "generate_bracket",
  "walkover",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const CLUB_POSITIONS = ["Secretary", "OC", "Projects Head"] as const;
export type ClubPosition = (typeof CLUB_POSITIONS)[number];

export const MODULE_POSITIONS = [
  "Head",
  "Core Team",
  "Senior Coordinator",
  "Coordinator",
  "Member",
] as const;
export type ModulePosition = (typeof MODULE_POSITIONS)[number];

export type UserRole =
  | { position: ClubPosition; module?: never }
  | { module: ModuleName; position: ModulePosition };

export const PROJECT_MODULES = [...MODULES, "General"] as const;
export type ProjectModuleName = (typeof PROJECT_MODULES)[number];

export const MODULE_ACCENTS: Record<ProjectModuleName, string> = {
  "Software Development": "var(--module-software-accent)",
  "Competitive Programming": "var(--module-cp-accent)",
  "Machine Learning": "var(--module-ml-accent)",
  Cybersecurity: "var(--module-security-accent)",
  Design: "var(--module-design-accent)",
  General: "var(--muted)",
};

export const MODULE_BARS: Record<ProjectModuleName, string> = {
  "Software Development": "var(--module-software-bar)",
  "Competitive Programming": "var(--module-cp-bar)",
  "Machine Learning": "var(--module-ml-bar)",
  Cybersecurity: "var(--module-security-bar)",
  Design: "var(--module-design-bar)",
  General: "var(--muted)",
};

const EXTRA_TAG_ACCENTS: Record<string, string> = {
  Tutorial: "var(--primary)",
  Announcement: "var(--brand-red)",
  "Event Recap": "var(--brand-ember)",
};

export function tagAccent(tag: string): string {
  return (
    MODULE_ACCENTS[tag as ProjectModuleName] ??
    EXTRA_TAG_ACCENTS[tag] ??
    "var(--muted)"
  );
}

export const LEADERSHIP_ROLES = CLUB_POSITIONS;
export type LeadershipRole = (typeof LEADERSHIP_ROLES)[number];

export const TEAM_ROLES = [...LEADERSHIP_ROLES, "Head"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

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

export const EVENT_PUBLICATION_STATUSES = ["draft", "published"] as const;
export type EventPublicationStatus =
  (typeof EVENT_PUBLICATION_STATUSES)[number];

export const CALENDAR_SCOPES = ["general", "module"] as const;
export type CalendarScope = (typeof CALENDAR_SCOPES)[number];

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
  "calendar_reminder",
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
] as const;
export type ImageExtension = (typeof ALLOWED_IMAGE_EXTENSIONS)[number];

export const ALLOWED_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;
export type ImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

export const IMAGE_EXTENSION_TO_MIME: Record<ImageExtension, ImageMimeType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/**
 * Regex fragment matching allowed image extensions
 * For use in filename validation
 * */
export const IMAGE_EXTENSIONS_REGEX_FRAGMENT = ALLOWED_IMAGE_EXTENSIONS.map(
  (e) => e.slice(1),
).join("|");

/* Code Runner */

export const CODE_RUNNER_LANGUAGES = ["cpp", "python"] as const;
export type CodeRunnerLanguage = (typeof CODE_RUNNER_LANGUAGES)[number];

export const CODE_RUNNER_LANGUAGE_LABELS: Record<CodeRunnerLanguage, string> = {
  cpp: "C++",
  python: "Python",
};

export const CODE_RUNNER_DEFAULT_CODE: Record<CodeRunnerLanguage, string> = {
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    
    return 0;
}
`,
  python: `import sys
input = sys.stdin.readline

`,
};

export const CODE_RUNNER_TIMEOUT_MS: Record<CodeRunnerLanguage, number> = {
  cpp: 10000,
  python: 15000,
};

export type TestCase = {
  id: string;
  input: string;
  expectedOutput: string;
  isCustom?: boolean;
};

export type TestResultStatus = "pass" | "fail" | "error" | "tle";

export type TestResult = {
  testCaseId: string;
  status: TestResultStatus;
  actualOutput: string;
  error?: string;
  executionTimeMs?: number;
};

export type ExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  timedOut?: boolean;
};

export type ProblemData = {
  title: string;
  platform: Platform;
  contestId: string;
  problemIndex: string;
  url: string;
};

export type WasmLoadState = "idle" | "downloading" | "ready" | "error";

export type WasmLoadStatus = {
  state: WasmLoadState;
  progress: number;
  message: string;
};

export const CF_CONTEST_YEAR_OPTIONS = [
  { label: "Any Time (All Problems)", minContestId: 0 },
  { label: "2020 Onwards (ID ≥ 1300)", minContestId: 1300 },
  { label: "2021 Onwards (ID ≥ 1470)", minContestId: 1470 },
  { label: "2022 Onwards (ID ≥ 1620)", minContestId: 1620 },
  { label: "2023 Onwards (ID ≥ 1770)", minContestId: 1770 },
  { label: "2024 Onwards (ID ≥ 1915)", minContestId: 1915 },
  { label: "2025 Onwards (ID ≥ 2050)", minContestId: 2050 },
] as const;
