import {
  APP_TIME_ZONE,
  IST_OFFSET_MS,
  MAX_RECRUITMENT_SCHEDULE_TICKS,
  MODULES,
  type ModuleName,
  type RecruitmentDocumentKind,
  type RecruitmentSeason,
  type RecruitmentStatus,
} from "@/lib/constants";
import type { IRecruitment } from "@/models/Recruitment";

export interface RecruitmentDocumentDto {
  _id: string;
  originalName: string;
  mimeType: "application/pdf";
  size: number;
}
export interface RecruitmentSlotDto {
  releaseAt: string | null;
  document: RecruitmentDocumentDto | null;
}
export interface RecruitmentModuleDto {
  module: ModuleName;
  resources: RecruitmentSlotDto;
  task: RecruitmentSlotDto;
  submissionDeadline: string | null;
}
export interface RecruitmentDto {
  _id: string;
  year: number;
  season: RecruitmentSeason;
  slug: string;
  label: string;
  status: RecruitmentStatus;
  publishedAt: string | null;
  modules: RecruitmentModuleDto[];
}

type ReleaseSlot = {
  releaseAt: Date | string | null;
  document: unknown | null;
};

/** The same boundary applies to public metadata and to every PDF request */
export function isDocumentReleased(
  edition: { status: RecruitmentStatus },
  slot: ReleaseSlot,
  now: Date = new Date(),
): boolean {
  return (
    edition.status === "published" &&
    slot.document != null &&
    slot.releaseAt !== null &&
    new Date(slot.releaseAt).getTime() <= now.getTime()
  );
}

export function serializeRecruitment(edition: IRecruitment): RecruitmentDto {
  const slot = (
    value: IRecruitment["modules"][number]["resources"],
  ): RecruitmentSlotDto => ({
    releaseAt: value.releaseAt ? new Date(value.releaseAt).toISOString() : null,
    document: value.document
      ? {
          _id: String(value.document._id),
          originalName: value.document.originalName,
          mimeType: value.document.mimeType,
          size: value.document.size,
        }
      : null,
  });
  return {
    _id: String(edition._id),
    year: edition.year,
    season: edition.season,
    slug: edition.slug,
    label: edition.label,
    status: edition.status,
    publishedAt: edition.publishedAt
      ? new Date(edition.publishedAt).toISOString()
      : null,
    modules: MODULES.map((module) => {
      const value = edition.modules.find((entry) => entry.module === module)!;
      return {
        module,
        resources: slot(value.resources),
        task: slot(value.task),
        submissionDeadline: value.submissionDeadline
          ? new Date(value.submissionDeadline).toISOString()
          : null,
      };
    }),
  };
}

/** Apply release visibility after reading the cached, serialized edition */
export function publicRecruitment(
  edition: RecruitmentDto,
  now: Date = new Date(),
): RecruitmentDto {
  const slot = (value: RecruitmentSlotDto): RecruitmentSlotDto => ({
    ...value,
    document: isDocumentReleased(edition, value, now) ? value.document : null,
  });
  return {
    ...edition,
    modules: edition.modules.map((module) => ({
      ...module,
      resources: slot(module.resources),
      task: slot(module.task),
    })),
  };
}

export function recruitmentDocumentUrl(id: string) {
  return `/api/recruitment/documents/${id}`;
}

export function recruitmentStatus(
  module: RecruitmentModuleDto,
  now: Date = new Date(),
): string {
  const deadline =
    module.submissionDeadline && new Date(module.submissionDeadline).getTime();
  if (deadline && deadline <= now.getTime()) return "Closed";
  if (module.task.document) {
    if (deadline) {
      const days = Math.ceil((deadline - now.getTime()) / DAY);
      return days === 1 ? "Closes within 24 hours" : `Closes in ${days} days`;
    }
    return "Task out";
  }
  return module.resources.document ? "Resources out" : "To be announced";
}

const DAY = 86_400_000;
const MIN_GAP = 0.17;
export type ScheduleMarkKind = RecruitmentDocumentKind | "deadline";
export interface ScheduleMark {
  kind: ScheduleMarkKind;
  at: string;
  position: number;
  flip: boolean;
  row: number;
}
export interface ScheduleLane {
  module: ModuleName;
  marks: ScheduleMark[];
  bar: { left: number; width: number } | null;
  rows: number;
}
export interface RecruitmentScheduleData {
  start: number;
  end: number;
  ticks: { at: number; position: number }[];
  lanes: ScheduleLane[];
}

export function buildRecruitmentSchedule(
  modules: RecruitmentModuleDto[],
): RecruitmentScheduleData | null {
  const lanes = MODULES.map((module) => {
    const entry = modules.find((value) => value.module === module);
    const marks: { kind: ScheduleMarkKind; at: string }[] = [];
    if (entry?.resources.releaseAt)
      marks.push({ kind: "resources", at: entry.resources.releaseAt });
    if (entry?.task.releaseAt)
      marks.push({ kind: "task", at: entry.task.releaseAt });
    if (entry?.submissionDeadline)
      marks.push({ kind: "deadline", at: entry.submissionDeadline });
    return {
      module,
      marks: marks.filter((mark) => Number.isFinite(Date.parse(mark.at))),
    };
  });
  const dates = lanes.flatMap((lane) =>
    lane.marks.map((mark) => Date.parse(mark.at)),
  );
  if (!dates.length) return null;
  const dayStart = (at: number) =>
    Math.floor((at + IST_OFFSET_MS) / DAY) * DAY - IST_OFFSET_MS;
  const start = Math.min(...dates) - 2 * DAY;
  const end = Math.max(...dates) + 2 * DAY;
  const position = (at: number) => ((at - start) / (end - start)) * 100;
  const ticks: RecruitmentScheduleData["ticks"] = [];
  let firstMonday =
    dayStart(start) +
    ((8 - new Date(start + IST_OFFSET_MS).getUTCDay()) % 7) * DAY;
  if (firstMonday < start) firstMonday += 7 * DAY;
  const weeks = Math.floor((end - firstMonday) / (7 * DAY)) + 1;
  const tickStep =
    Math.max(1, Math.ceil(weeks / MAX_RECRUITMENT_SCHEDULE_TICKS)) * 7 * DAY;
  for (
    let at = firstMonday;
    at <= end && ticks.length < MAX_RECRUITMENT_SCHEDULE_TICKS;
    at += tickStep
  )
    ticks.push({ at, position: position(at) });
  return {
    start,
    end,
    ticks,
    lanes: lanes.map((lane) => {
      // Estimate each label's footprint
      const rowEnds: number[] = [];
      const marks = lane.marks
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .map((mark) => {
          const ratio = position(Date.parse(mark.at)) / 100;
          const flip = ratio > 0.72;
          const left = flip ? ratio - MIN_GAP : ratio;
          const right = flip ? ratio : ratio + MIN_GAP;
          let row = rowEnds.findIndex((last) => left >= last);
          if (row === -1) row = rowEnds.length;
          rowEnds[row] = right;
          return { ...mark, position: ratio * 100, flip, row };
        });
      return {
        module: lane.module,
        marks,
        rows: Math.max(2, rowEnds.length),
        bar: marks.length
          ? {
              left: marks[0].position,
              width: marks[marks.length - 1].position - marks[0].position,
            }
          : null,
      };
    }),
  };
}

export function recruitmentDateLabel(value: string | number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: APP_TIME_ZONE,
  }).format(new Date(value));
}
