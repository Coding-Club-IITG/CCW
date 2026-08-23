import { MODULES, PROJECT_MODULES } from "@/lib/constants";
import {
  ATLAS_RESULT_KINDS,
  type AtlasResult,
  type AtlasResultKind,
  type ParsedAtlasQuery,
} from "@/lib/atlas/types";

const FILTERS = new Set([
  "type",
  "module",
  "tag",
  "status",
  "author",
  "year",
  "before",
  "after",
]);

const KIND_ALIASES: Record<string, AtlasResultKind> = {
  blog: "post",
  blogs: "post",
  posts: "post",
  events: "event",
  projects: "project",
  modules: "module",
  calendar: "calendar",
  files: "file",
  notifications: "notification",
  hackathons: "hackathon",
  problems: "potd",
  potd: "potd",
  contests: "contest",
  people: "team",
  team: "team",
};

function unquote(value: string): string {
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

function validDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseAtlasQuery(value: string): ParsedAtlasQuery {
  const filters: ParsedAtlasQuery["filters"] = { kinds: [] };
  const phrases: string[] = [];
  const terms: string[] = [];
  const tokens = value.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];

  for (const token of tokens) {
    const separator = token.indexOf(":");
    if (separator > 0 && FILTERS.has(token.slice(0, separator).toLowerCase())) {
      const key = token.slice(0, separator).toLowerCase();
      const raw = unquote(token.slice(separator + 1)).trim();
      if (!raw) continue;
      if (key === "type") {
        const normalized = raw.toLowerCase();
        const kind =
          KIND_ALIASES[normalized] ??
          (ATLAS_RESULT_KINDS.includes(normalized as AtlasResultKind)
            ? (normalized as AtlasResultKind)
            : undefined);
        if (kind && !filters.kinds.includes(kind)) filters.kinds.push(kind);
      } else if (key === "module") {
        const selectedModule = PROJECT_MODULES.find(
          (item) => item.toLowerCase() === raw.toLowerCase(),
        );
        if (selectedModule) filters.module = selectedModule;
      } else if (key === "tag") filters.tag = raw;
      else if (key === "status") filters.status = raw;
      else if (key === "author") filters.author = raw;
      else if (key === "year" && /^\d{4}$/.test(raw))
        filters.year = Number(raw);
      else if (key === "before") filters.before = validDate(raw);
      else if (key === "after") filters.after = validDate(raw);
      continue;
    }
    const clean = unquote(token).trim();
    if (clean) {
      terms.push(clean);
      if (/^["']/.test(token)) phrases.push(clean);
    }
  }

  return { text: terms.join(" ").trim(), phrases, filters };
}

export function atlasDateRange(query: ParsedAtlasQuery):
  | {
      $gte?: Date;
      $lt?: Date;
      $lte?: Date;
    }
  | undefined {
  const range: { $gte?: Date; $lt?: Date; $lte?: Date } = {};
  if (query.filters.year) {
    range.$gte = new Date(`${query.filters.year}-01-01T00:00:00.000Z`);
    range.$lt = new Date(`${query.filters.year + 1}-01-01T00:00:00.000Z`);
  }
  if (query.filters.after) range.$gte = query.filters.after;
  if (query.filters.before) range.$lte = query.filters.before;
  return Object.keys(range).length ? range : undefined;
}

export function atlasMatchScore(
  title: string,
  searchable: readonly string[],
  query: string,
  date?: Date | string | null,
): Pick<AtlasResult, "score" | "matchReason"> {
  const needle = query.trim().toLowerCase();
  const normalizedTitle = title.toLowerCase();
  let score = 20;
  let matchReason = "Matches your filters";
  if (needle) {
    if (normalizedTitle === needle) {
      score = 100;
      matchReason = "Exact title match";
    } else if (normalizedTitle.startsWith(needle)) {
      score = 85;
      matchReason = "Title starts with your search";
    } else if (normalizedTitle.includes(needle)) {
      score = 70;
      matchReason = "Title contains your search";
    } else if (searchable.some((item) => item.toLowerCase().includes(needle))) {
      score = 50;
      matchReason = "Matches description or metadata";
    }
  }
  if (date) {
    const age = Date.now() - new Date(date).getTime();
    if (age >= 0 && age < 180 * 24 * 60 * 60 * 1000) score += 3;
  }
  return { score, matchReason };
}

export function moduleFromText(value: string) {
  return MODULES.find((module) => module.toLowerCase() === value.toLowerCase());
}
