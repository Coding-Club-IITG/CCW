import type { AuditSummary, AuditSummaryValue } from "@/lib/audit/types";

export const AUDIT_SUMMARY_MAX_KEYS = 24;
export const AUDIT_SUMMARY_MAX_STRING = 160;
export const AUDIT_SUMMARY_MAX_ARRAY = 12;

const text = (value: unknown): string | undefined =>
  typeof value === "string"
    ? value.slice(0, AUDIT_SUMMARY_MAX_STRING)
    : undefined;

function value(value: unknown): AuditSummaryValue | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return text(value);
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value !== null &&
    "toHexString" in value &&
    typeof (value as { toHexString?: unknown }).toHexString === "function"
  ) {
    return (value as { toHexString: () => string })
      .toHexString()
      .slice(0, AUDIT_SUMMARY_MAX_STRING);
  }
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .slice(0, AUDIT_SUMMARY_MAX_ARRAY)
      .map((item) => item.slice(0, AUDIT_SUMMARY_MAX_STRING));
  }
  return undefined;
}

export function boundedSummary(
  input: Record<string, unknown>,
  allowlist: readonly string[],
): AuditSummary {
  const output: AuditSummary = {};
  for (const key of allowlist.slice(0, AUDIT_SUMMARY_MAX_KEYS)) {
    const safe = value(input[key]);
    if (safe !== undefined) output[key] = safe;
  }
  return output;
}

const count = (value: unknown) => (Array.isArray(value) ? value.length : 0);
const length = (value: unknown) =>
  typeof value === "string" ? value.length : 0;

export function summarizeUser(input: Record<string, unknown>): AuditSummary {
  return boundedSummary(
    {
      ...input,
      managedModules: input.managedModules,
      roles: Array.isArray(input.roles)
        ? input.roles.map((role) => {
            const item = role as Record<string, unknown>;
            return [item.module, item.position].filter(Boolean).join(":");
          })
        : [],
    },
    [
      "access",
      "tenure",
      "managedModules",
      "roles",
      "pizza_count",
      "cascadeCount",
    ],
  );
}

export function summarizePublicContent(
  input: Record<string, unknown>,
): AuditSummary {
  return boundedSummary(
    {
      title: input.title,
      status: input.status,
      tags: input.tags,
      module: input.module,
      date: input.date ?? input.startDate,
      endDate: input.endDate,
      publishedAt: input.publishedAt,
      linkedCalendarEventId: input.calendarEventId,
      authorCount: count(input.authors),
      bodyLength: length(input.content ?? input.body),
      excerptLength: length(input.excerpt),
      shortDescriptionLength: length(input.shortDescription),
      descriptionLength: length(input.description),
    },
    [
      "title",
      "status",
      "tags",
      "module",
      "date",
      "endDate",
      "publishedAt",
      "linkedCalendarEventId",
      "authorCount",
      "bodyLength",
      "excerptLength",
      "shortDescriptionLength",
      "descriptionLength",
    ],
  );
}

export function summarizeNotification(
  input: Record<string, unknown>,
): AuditSummary {
  return boundedSummary(
    {
      target: input.target,
      type: input.type,
      title: input.title,
      recipientCount: input.recipientCount,
      hasLink: typeof input.link === "string" && input.link.length > 0,
    },
    ["target", "type", "title", "recipientCount", "hasLink"],
  );
}

export function summarizeFile(input: Record<string, unknown>): AuditSummary {
  const acl =
    input.accessControl && typeof input.accessControl === "object"
      ? (input.accessControl as Record<string, unknown>)
      : input;
  return boundedSummary(
    {
      title: input.title,
      category: input.category ?? input.folder,
      mimeType: input.mimeType,
      size: input.size,
      allowDownload: input.allowDownload ?? input.isDownloadable,
      allMembers: acl.allMembers,
      accessCount:
        count(acl.allowedUsers) +
        count(acl.allowedModules) +
        count(acl.allowedClubPositions) +
        count(acl.allowedModulePositions),
    },
    [
      "title",
      "category",
      "mimeType",
      "size",
      "allowDownload",
      "allMembers",
      "accessCount",
    ],
  );
}

export function summarizeCalendar(
  input: Record<string, unknown>,
): AuditSummary {
  return boundedSummary(
    {
      title: input.title,
      scope: input.scope,
      module: input.module,
      startAt: input.startAt,
      endAt: input.endAt,
      recurrenceType: input.recurrenceType,
      recurrenceCount: input.recurrenceCount,
      linkedPublicEventId: input.publicEventId,
      hasLocation:
        typeof input.location === "string" && input.location.length > 0,
      hasExternalUrl:
        typeof input.externalUrl === "string" && input.externalUrl.length > 0,
      agendaLength: length(input.agenda),
      minutesLength: length(input.minutes),
      cascadeCount: input.cascadeCount,
    },
    [
      "title",
      "scope",
      "module",
      "startAt",
      "endAt",
      "recurrenceType",
      "recurrenceCount",
      "linkedPublicEventId",
      "hasLocation",
      "hasExternalUrl",
      "agendaLength",
      "minutesLength",
      "cascadeCount",
    ],
  );
}

export function summarizeCounts(input: Record<string, unknown>): AuditSummary {
  return boundedSummary(input, [
    "title",
    "status",
    "startAt",
    "endAt",
    "problemCount",
    "participantCount",
    "sectionCount",
    "entryCount",
    "cascadeCount",
  ]);
}

export function summarizeCredits(
  sections: readonly { heading: string; entries: readonly unknown[] }[],
): AuditSummary {
  return boundedSummary(
    {
      headings: sections.map((section) => section.heading),
      sectionCount: sections.length,
      entryCount: sections.reduce(
        (total, section) => total + section.entries.length,
        0,
      ),
    },
    ["headings", "sectionCount", "entryCount"],
  );
}

export function summarizePOTD(input: Record<string, unknown>): AuditSummary {
  return boundedSummary(input, [
    "date",
    "difficulty",
    "platform",
    "problemId",
    "status",
    "pointsAwarded",
    "scheduledCount",
    "deletedCount",
    "force",
  ]);
}

export function summarizeHackathon(
  input: Record<string, unknown>,
): AuditSummary {
  return boundedSummary(
    {
      name: input.name,
      organization: input.organization,
      status: input.status,
      minMembers: input.minMembers,
      maxMembers: input.maxMembers,
      skills: input.skills,
      deadline: input.deadline,
      descriptionLength: length(input.description),
      participantCount: input.participantCount,
    },
    [
      "name",
      "organization",
      "status",
      "minMembers",
      "maxMembers",
      "skills",
      "deadline",
      "descriptionLength",
      "participantCount",
    ],
  );
}

export function summarizeContest(input: Record<string, unknown>): AuditSummary {
  return boundedSummary(
    {
      name: input.name,
      status: input.status,
      format: input.format,
      mode: input.mode,
      startTime: input.startTime,
      teamSize: input.teamSize,
      problemSelectionMode: input.problemSelectionMode,
      problemCount: input.problemCount ?? count(input.problemSlots),
      participantCount: input.participantCount ?? count(input.registrations),
      archived: input.archived,
      durationSeconds: input.durationSeconds,
      ratingMin: input.bulkRatingMin,
      ratingMax: input.bulkRatingMax,
    },
    [
      "name",
      "status",
      "format",
      "mode",
      "startTime",
      "teamSize",
      "problemSelectionMode",
      "problemCount",
      "participantCount",
      "archived",
      "durationSeconds",
      "ratingMin",
      "ratingMax",
    ],
  );
}
