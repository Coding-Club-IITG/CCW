import type { RoomStreamEvent } from "@/lib/contests/runtime";

import type { IContestPreset } from "@/models/ContestPreset";
import type { IContestTeamRequest } from "@/models/ContestTeamRequest";

export type ContestAvailableTeamDto = {
  teamId: string;
  teamName: string;
  memberCount: number;
  maxCapacity: number;
  isPublic: boolean;
  leaderId: string;
};

export type ContestTeamRequestDto = {
  _id: string;
  contestId: string;
  teamId: string;
  type: IContestTeamRequest["type"];
  status: IContestTeamRequest["status"];
  fromUserId: string;
  toUserId: string | null;
  fromUserHandle: string;
  toUserHandle: string | null;
  createdAt: string;
  updatedAt: string;
};

export function toContestTeamRequestDto(
  request: Pick<
    IContestTeamRequest,
    | "contestId"
    | "teamId"
    | "type"
    | "status"
    | "fromUserId"
    | "toUserId"
    | "createdAt"
    | "updatedAt"
  > & { _id: { toString(): string } },
  handles: ReadonlyMap<string, string>,
): ContestTeamRequestDto {
  return {
    _id: String(request._id),
    contestId: String(request.contestId),
    teamId: String(request.teamId),
    type: request.type,
    status: request.status,
    fromUserId: request.fromUserId,
    toUserId: request.toUserId ?? null,
    fromUserHandle: handles.get(request.fromUserId) ?? request.fromUserId,
    toUserHandle: request.toUserId
      ? (handles.get(request.toUserId) ?? request.toUserId)
      : null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

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
    points?: number;
    timeLimitMinutes?: number;
  }>;
  fineTunedProblemCount?: number;
  isGlobal?: boolean;
  overallDurationMinutes?: number;
  perProblemDurationMinutes?: number;
  teamSize?: number;
  spectatorRestriction?: "none" | "all" | "admin_creator" | "club_members";
  registrationSettings?: {
    type: "open" | "closed";
    maxParticipants: number;
    entrantCapacity?: number;
  };
  bracketSettings?: {
    type?: "single_elimination" | "double_elimination";
  };
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
  deadlineAt?: number | null;
  closedAt?: number | null;
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
    isGlobal: preset.isGlobal ?? false,
    overallDurationMinutes: preset.overallDurationMinutes,
    perProblemDurationMinutes: preset.perProblemDurationMinutes,
    teamSize: preset.teamSize,
    spectatorRestriction: preset.spectatorRestriction,
    registrationSettings: preset.registrationSettings
      ? {
          type: preset.registrationSettings.type,
          maxParticipants: preset.registrationSettings.maxParticipants,
          entrantCapacity: preset.registrationSettings.entrantCapacity,
        }
      : undefined,
    bracketSettings: preset.bracketSettings
      ? {
          type: preset.bracketSettings.type,
        }
      : undefined,
    archived: preset.archived ?? false,
    createdAt: preset.createdAt?.toISOString(),
    updatedAt: preset.updatedAt?.toISOString(),
  };
}
