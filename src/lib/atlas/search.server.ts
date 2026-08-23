import "server-only";

import type { Types } from "mongoose";
import { buildAccessFilter } from "@/lib/access/files";
import { isHead } from "@/lib/access/roles";
import { atlasDateRange, atlasMatchScore } from "@/lib/atlas/query";
import type {
  AtlasResult,
  AtlasResultKind,
  AtlasSearchResponse,
  ParsedAtlasQuery,
} from "@/lib/atlas/types";
import { PLATFORM_PROBLEM_URLS, type UserRole } from "@/lib/constants";
import dbConnect from "@/lib/mongodb";
import { parseManagedModules, parseRoles } from "@/lib/roles";
import { prepareSearchQuery } from "@/lib/search";
import BlogPost from "@/models/BlogPost";
import CalendarEvent from "@/models/CalendarEvent";
import Contest from "@/models/Contest";
import Event from "@/models/Event";
import FileEntry from "@/models/FileEntry";
import Hackathon from "@/models/Hackathon";
import Notification from "@/models/Notification";
import POTDProblem from "@/models/POTDProblem";
import Project from "@/models/Project";
import User from "@/models/User";

export type AtlasSessionUser = {
  id: string;
  access?: string;
  managedModules?: unknown;
  roles?: unknown;
};

type LeanRecord = Record<string, unknown> & { _id: Types.ObjectId };
type Provider = () => Promise<AtlasResult[]>;

const PER_KIND_LIMIT = 5;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function date(value: unknown): Date | undefined {
  const parsed = value instanceof Date ? value : new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function safeHref(value: unknown, fallback: string): string {
  const href = text(value).trim();
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    if (url.protocol === "https:" || url.protocol === "http:") return href;
  } catch {
    // Use the known-safe fallback below
  }
  return fallback;
}

function includeKind(query: ParsedAtlasQuery, kind: AtlasResultKind): boolean {
  return query.filters.kinds.length === 0 || query.filters.kinds.includes(kind);
}

function regexFilter(query: ParsedAtlasQuery, fields: string[]) {
  const prepared = prepareSearchQuery(query.text, { minLength: 1 });
  if (!prepared) return {};
  const regex = { $regex: prepared.pattern, $options: "i" };
  return { $or: fields.map((field) => ({ [field]: regex })) };
}

function baseResult(options: {
  record: LeanRecord;
  kind: AtlasResultKind;
  title: string;
  description: string;
  href?: string;
  internal: boolean;
  searchable?: string[];
  recordDate?: Date;
  module?: string;
  tags?: string[];
  status?: string;
  actions?: AtlasResult["actions"];
}): AtlasResult {
  const match = atlasMatchScore(
    options.title,
    options.searchable ?? [],
    "",
    options.recordDate,
  );
  return {
    id: String(options.record._id),
    kind: options.kind,
    title: options.title,
    description: options.description,
    href: options.href,
    internal: options.internal,
    date: options.recordDate?.toISOString(),
    module: options.module as AtlasResult["module"],
    tags: options.tags,
    status: options.status,
    actions: options.actions,
    ...match,
  };
}

function commonFilter(
  query: ParsedAtlasQuery,
  dateField: string,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  const range = atlasDateRange(query);
  if (range) filter[dateField] = range;
  if (query.filters.module) filter.module = query.filters.module;
  if (query.filters.tag) filter.tags = query.filters.tag;
  if (query.filters.status) filter.status = query.filters.status;
  return filter;
}

async function posts(
  query: ParsedAtlasQuery,
  user: AtlasSessionUser | null,
): Promise<AtlasResult[]> {
  const visibility: Record<string, unknown> = !user
    ? { status: "published" }
    : isHead(user.access)
      ? {}
      : {
          $or: [
            { status: "published" },
            { status: "draft", "authors.userId": user.id },
          ],
        };
  const filter: Record<string, unknown> = {
    $and: [
      visibility,
      regexFilter(query, [
        "title",
        "excerpt",
        "content",
        "tags",
        "authors.name",
      ]),
    ],
  };
  const range = atlasDateRange(query);
  if (range) filter.publishedAt = range;
  const postTags = [query.filters.module, query.filters.tag].filter(
    (value): value is string => Boolean(value),
  );
  if (postTags.length) filter.tags = { $all: postTags };
  if (query.filters.author)
    filter["authors.name"] = {
      $regex: prepareSearchQuery(query.filters.author)?.pattern,
      $options: "i",
    };
  if (query.filters.status && user) filter.status = query.filters.status;
  const records = (await BlogPost.find(filter)
    .select("title slug excerpt tags authors status publishedAt updatedAt")
    .sort({ publishedAt: -1, updatedAt: -1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) => {
    const authors = Array.isArray(record.authors)
      ? record.authors
          .map((author) => text((author as Record<string, unknown>).name))
          .filter(Boolean)
      : [];
    const published = text(record.status) === "published";
    return baseResult({
      record,
      kind: "post",
      title: text(record.title),
      description: text(record.excerpt) || `${text(record.status)} blog post`,
      href: published
        ? `/blog/${text(record.slug)}`
        : `/internal/blog/${text(record.slug)}/edit`,
      internal: !published,
      searchable: [...strings(record.tags), ...authors],
      recordDate: date(record.publishedAt) ?? date(record.updatedAt),
      tags: strings(record.tags),
      status: text(record.status),
    });
  });
}

async function events(query: ParsedAtlasQuery): Promise<AtlasResult[]> {
  const common = commonFilter(query, "startDate");
  delete common.status;
  const filter = {
    $and: [
      { status: "published" },
      common,
      regexFilter(query, [
        "title",
        "shortDescription",
        "description",
        "tags",
        "module",
      ]),
    ],
  };
  const records = (await Event.find(filter)
    .select(
      "title slug shortDescription startDate module tags status calendarEventId",
    )
    .sort({ startDate: -1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) =>
    baseResult({
      record,
      kind: "event",
      title: text(record.title),
      description: text(record.shortDescription),
      href: `/events/${text(record.slug)}`,
      internal: false,
      searchable: [text(record.module), ...strings(record.tags)],
      recordDate: date(record.startDate),
      module: text(record.module),
      tags: strings(record.tags),
      status: text(record.status),
    }),
  );
}

async function projects(query: ParsedAtlasQuery): Promise<AtlasResult[]> {
  const filter = {
    ...commonFilter(query, "date"),
    ...regexFilter(query, ["title", "description", "tags", "module"]),
  };
  const records = (await Project.find(filter)
    .select("title description date module tags status repoLink liveUrl")
    .sort({ date: -1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) =>
    baseResult({
      record,
      kind: "project",
      title: text(record.title),
      description: text(record.description),
      href: safeHref(record.repoLink, "/projects"),
      internal: false,
      searchable: [text(record.module), ...strings(record.tags)],
      recordDate: date(record.date),
      module: text(record.module),
      tags: strings(record.tags),
      status: text(record.status),
      actions: text(record.liveUrl)
        ? [
            {
              label: "Repository",
              href: safeHref(record.repoLink, "/projects"),
              external: true,
            },
            {
              label: "Live site",
              href: safeHref(record.liveUrl, "/projects"),
              external: true,
            },
          ]
        : [
            {
              label: "Repository",
              href: safeHref(record.repoLink, "/projects"),
              external: true,
            },
          ],
    }),
  );
}

async function team(query: ParsedAtlasQuery): Promise<AtlasResult[]> {
  const roleFilter: Record<string, unknown> =
    query.filters.module && query.filters.module !== "General"
      ? {
          $or: [
            { managedModules: query.filters.module },
            { "roles.module": query.filters.module },
          ],
        }
      : {};
  const filter: Record<string, unknown> = {
    $and: [
      roleFilter,
      regexFilter(query, ["name", "bio", "roles.module", "roles.position"]),
      { email: { $ne: "codingclub@iitg.ac.in" } },
      {
        $or: [
          { access: "Head" },
          {
            "roles.position": {
              $in: ["Secretary", "OC", "Projects Head", "Head"],
            },
          },
        ],
      },
    ],
  };
  const records = (await User.find(filter)
    .select("name bio managedModules roles tenure")
    .sort({ name: 1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) => {
    const roles = (
      Array.isArray(record.roles) ? record.roles : []
    ) as UserRole[];
    const roleLabels = roles.map((role) =>
      role.module ? `${role.module} · ${role.position}` : role.position,
    );
    return baseResult({
      record,
      kind: "team",
      title: text(record.name),
      description:
        text(record.bio) || roleLabels.join(", ") || "Club leadership",
      href: "/team",
      internal: false,
      searchable: roleLabels,
    });
  });
}

async function calendars(query: ParsedAtlasQuery): Promise<AtlasResult[]> {
  const filter = {
    ...commonFilter(query, "startAt"),
    ...regexFilter(query, [
      "title",
      "description",
      "location",
      "agenda",
      "minutes",
      "module",
    ]),
  };
  const records = (await CalendarEvent.find(filter)
    .select("title description scope module startAt endAt location")
    .sort({ startAt: -1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) =>
    baseResult({
      record,
      kind: "calendar",
      title: text(record.title),
      description: text(record.description) || text(record.location),
      href: `/internal/calendar/${String(record._id)}`,
      internal: true,
      searchable: [text(record.module), text(record.location)],
      recordDate: date(record.startAt),
      module: text(record.module),
      status: text(record.scope),
    }),
  );
}

async function files(
  query: ParsedAtlasQuery,
  user: AtlasSessionUser,
): Promise<AtlasResult[]> {
  const managed = parseManagedModules(user.managedModules);
  const roles = parseRoles(user.roles);
  const filter = {
    $and: [
      buildAccessFilter(user.id, user.access ?? "Member", managed, roles),
      commonFilter(query, "createdAt"),
      regexFilter(query, [
        "title",
        "description",
        "folder",
        "originalName",
        "uploadedByName",
        "uploaderModule",
      ]),
    ],
  };
  const records = (await FileEntry.find(filter)
    .select(
      "title description originalName folder uploadedByName uploaderModule isDownloadable createdAt",
    )
    .sort({ createdAt: -1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) =>
    baseResult({
      record,
      kind: "file",
      title: text(record.title),
      description:
        text(record.description) ||
        `${text(record.folder)} · ${text(record.originalName)}`,
      href: `/api/files/${String(record._id)}`,
      internal: true,
      searchable: [
        text(record.folder),
        text(record.originalName),
        text(record.uploadedByName),
        text(record.uploaderModule),
      ],
      recordDate: date(record.createdAt),
      module: text(record.uploaderModule),
      actions: [
        {
          label: record.isDownloadable === false ? "View" : "Open file",
          href: `/api/files/${String(record._id)}`,
        },
      ],
    }),
  );
}

async function notifications(
  query: ParsedAtlasQuery,
  user: AtlasSessionUser,
): Promise<AtlasResult[]> {
  const range = atlasDateRange(query);
  const filter: Record<string, unknown> = {
    userId: user.id,
    ...(range ? { createdAt: range } : {}),
    ...regexFilter(query, ["title", "message"]),
  };
  if (query.filters.status === "unread") filter.read = false;
  const records = (await Notification.find(filter)
    .select("title message link read createdAt")
    .sort({ createdAt: -1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) =>
    baseResult({
      record,
      kind: "notification",
      title: text(record.title),
      description: text(record.message),
      href: safeHref(record.link, "/internal/notifications"),
      internal: true,
      recordDate: date(record.createdAt),
      status: record.read ? "read" : "unread",
    }),
  );
}

async function hackathons(query: ParsedAtlasQuery): Promise<AtlasResult[]> {
  const filter = {
    ...commonFilter(query, "deadline"),
    ...regexFilter(query, ["name", "organization", "description", "skills"]),
  };
  const records = (await Hackathon.find(filter)
    .select("name organization description skills deadline status")
    .sort({ deadline: -1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) =>
    baseResult({
      record,
      kind: "hackathon",
      title: text(record.name),
      description: text(record.description) || text(record.organization),
      href: `/internal/hackathons/${String(record._id)}`,
      internal: true,
      searchable: [text(record.organization), ...strings(record.skills)],
      recordDate: date(record.deadline),
      tags: strings(record.skills),
      status: text(record.status),
    }),
  );
}

async function potd(query: ParsedAtlasQuery): Promise<AtlasResult[]> {
  const filter = {
    ...regexFilter(query, [
      "name",
      "tags",
      "platform",
      "contestId",
      "problemIndex",
    ]),
  };
  if (query.filters.tag)
    (filter as Record<string, unknown>).tags = query.filters.tag;
  const records = (await POTDProblem.find(filter)
    .select("name platform contestId problemIndex rating tags updatedAt")
    .sort({ updatedAt: -1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) => {
    const platform = text(record.platform) as "codeforces" | "atcoder";
    const href =
      PLATFORM_PROBLEM_URLS[platform]?.(
        text(record.contestId),
        text(record.problemIndex),
      ) ?? "/internal/potd/past-problems";
    return baseResult({
      record,
      kind: "potd",
      title: text(record.name),
      description: `${platform} · ${text(record.contestId)} ${text(record.problemIndex)}`,
      href,
      internal: true,
      searchable: strings(record.tags),
      recordDate: date(record.updatedAt),
      tags: strings(record.tags),
      status: record.rating ? `Rating ${String(record.rating)}` : undefined,
    });
  });
}

async function contests(query: ParsedAtlasQuery): Promise<AtlasResult[]> {
  const filter = {
    ...commonFilter(query, "startTime"),
    ...regexFilter(query, ["name", "platform", "platformContestId"]),
  };
  const records = (await Contest.find(filter)
    .select("name platform platformContestId startTime endTime url")
    .sort({ startTime: -1 })
    .limit(PER_KIND_LIMIT)
    .lean()) as unknown as LeanRecord[];
  return records.map((record) =>
    baseResult({
      record,
      kind: "contest",
      title: text(record.name),
      description: `${text(record.platform)} contest`,
      href: safeHref(record.url, "/internal/cp"),
      internal: true,
      searchable: [text(record.platform), text(record.platformContestId)],
      recordDate: date(record.startTime),
      status:
        date(record.endTime) && date(record.endTime)!.getTime() < Date.now()
          ? "completed"
          : "upcoming",
    }),
  );
}

export async function searchAtlas(
  query: ParsedAtlasQuery,
  user: AtlasSessionUser | null,
): Promise<AtlasSearchResponse> {
  await dbConnect();
  const providers: Array<[AtlasResultKind, Provider]> = [];
  if (includeKind(query, "post"))
    providers.push(["post", () => posts(query, user)]);
  if (includeKind(query, "event"))
    providers.push(["event", () => events(query)]);
  if (includeKind(query, "project"))
    providers.push(["project", () => projects(query)]);
  if (includeKind(query, "team")) providers.push(["team", () => team(query)]);
  if (user) {
    if (includeKind(query, "calendar"))
      providers.push(["calendar", () => calendars(query)]);
    if (includeKind(query, "file"))
      providers.push(["file", () => files(query, user)]);
    if (includeKind(query, "notification"))
      providers.push(["notification", () => notifications(query, user)]);
    if (includeKind(query, "hackathon"))
      providers.push(["hackathon", () => hackathons(query)]);
    if (includeKind(query, "potd")) providers.push(["potd", () => potd(query)]);
    if (includeKind(query, "contest"))
      providers.push(["contest", () => contests(query)]);
  }
  const settled = await Promise.allSettled(
    providers.map(([, provider]) => provider()),
  );
  const items: AtlasResult[] = [];
  const partialFailures: AtlasResultKind[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") items.push(...result.value);
    else partialFailures.push(providers[index][0]);
  });
  const ranked = items.map((item) => ({
    ...item,
    ...atlasMatchScore(
      item.title,
      [item.description, item.module ?? "", ...(item.tags ?? [])],
      query.text,
      item.date,
    ),
  }));
  return {
    items: ranked.sort((a, b) => b.score - a.score).slice(0, 30),
    partialFailures,
  };
}
