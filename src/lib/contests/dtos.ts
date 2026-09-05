import type { RoomStreamEvent } from "@/lib/contests/runtime";
import type { IContestPreset } from "@/models/ContestPreset";

export type ContestPresetDto = {
  _id: string;
  name: string;
  description?: string;
  format?: "1v1" | "solo-tournament" | "team-tournament" | "bracket";
  mode?: "blitz" | "arena";
  durationSeconds?: number;
  problemSelectionMode?: "bulk" | "fine-tuned";
  bulkPlatform?: string;
  bulkRatingMin?: number;
  bulkRatingMax?: number;
  bulkProblemCount?: number;
  bulkMinContestId?: number;
  problemSlots?: Array<{
    platform?: string;
    rating?: number;
    problemId?: string;
    roundNumber?: number;
  }>;
  fineTunedProblemCount?: number;
  archived?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ContestRoomProblemDto = {
  problemId: string;
  name?: string;
  rating?: number;
  points?: number;
  revealedAt?: number | null;
  statementHtml?: string;
  inputSpecificationHtml?: string;
  outputSpecificationHtml?: string;
  constraintsHtml?: string;
  notesHtml?: string;
  samples?: Array<{ input: string; output: string }>;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  [key: string]: unknown;
};

export type ContestRoomMemberDto = {
  id: string;
  name: string;
  pizza_count: number;
  handle: string;
  avatar: string | null;
};

export type ContestRoomTeamDto = {
  _id: string;
  name: string;
  score: number;
  members: ContestRoomMemberDto[];
};

export type ContestRegistrationDto = {
  userId: string;
  cfHandle: string;
  teamName: string;
  registeredAt: string | null;
  image: string | null;
};

export type RoomEventPayloadDto = RoomStreamEvent;

export type RoomActivityDto = {
  icon: string;
  text: string;
  timestamp: number;
  color: string;
  id: number;
};

type ContestPresetSource = IContestPreset & {
  _id: { toString(): string };
};

export function toContestPresetDto(
  preset: ContestPresetSource,
): ContestPresetDto {
  return {
    _id: preset._id.toString(),
    name: preset.name,
    description: preset.description,
    format: preset.format,
    mode: preset.mode,
    durationSeconds: preset.durationSeconds,
    problemSelectionMode: preset.problemSelectionMode,
    bulkPlatform: preset.bulkPlatform,
    bulkRatingMin: preset.bulkRatingMin,
    bulkRatingMax: preset.bulkRatingMax,
    bulkProblemCount: preset.bulkProblemCount,
    bulkMinContestId: preset.bulkMinContestId,
    problemSlots: preset.problemSlots?.map((slot) => ({
      platform: slot.platform,
      rating: slot.rating,
      problemId: slot.problemId,
      roundNumber: slot.roundNumber,
    })),
    fineTunedProblemCount: preset.problemSlots?.length,
    archived: preset.archived ?? false,
    createdAt: preset.createdAt?.toISOString(),
    updatedAt: preset.updatedAt?.toISOString(),
  };
}
