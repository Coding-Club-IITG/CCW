import type { ModuleName } from "@/lib/constants";

export const ATLAS_RESULT_KINDS = [
  "route",
  "command",
  "module",
  "post",
  "event",
  "project",
  "team",
  "calendar",
  "file",
  "notification",
  "hackathon",
  "potd",
  "contest",
] as const;

export type AtlasResultKind = (typeof ATLAS_RESULT_KINDS)[number];

export type AtlasAction = {
  label: string;
  href?: string;
  command?: "toggle-theme" | "toggle-view";
  external?: boolean;
};

export type AtlasRelation = {
  id: string;
  kind: AtlasResultKind;
  title: string;
  href: string;
  basis: string;
  inferred: boolean;
};

export type AtlasResult = {
  id: string;
  kind: AtlasResultKind;
  title: string;
  description: string;
  href?: string;
  date?: string;
  module?: ModuleName | "General";
  tags?: string[];
  status?: string;
  internal: boolean;
  matchReason: string;
  score: number;
  actions?: AtlasAction[];
};

export type AtlasSearchResponse = {
  items: AtlasResult[];
  partialFailures: AtlasResultKind[];
};

export type AtlasPreviewResponse = {
  item: AtlasResult;
  relations: AtlasRelation[];
};

export type AtlasFilters = {
  kinds: AtlasResultKind[];
  module?: ModuleName | "General";
  tag?: string;
  status?: string;
  author?: string;
  year?: number;
  before?: Date;
  after?: Date;
};

export type ParsedAtlasQuery = {
  text: string;
  phrases: string[];
  filters: AtlasFilters;
};
