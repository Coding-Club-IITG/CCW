export interface ContestCreationForm {
  name: string;
  description: string;
  mode: string;
  format: string;
  teamSize: number;
  maxParticipants: number;
  startTime: string;
  problemSelectionMode: string;
  bulkRatingMin: number;
  bulkRatingMax: number;
  bulkProblemCount: number;
  bulkMinContestId: number;
  fineTunedProblemCount: string | number;
  fineTunedProblems: string[];
  fineTunedProblemPoints?: number[];
  fineTunedProblemTimeLimits?: number[];
  presetId: string;
  thirdPlacePlayoff: boolean;
  seedingMethod: string;
  bracketType?: "single_elimination" | "double_elimination";
  registrationStartMode: string;
  registrationStartTime: string;
  registrationType: string;
  overallDurationMinutes?: number;
  perProblemDurationMinutes?: number;
}

export type { ContestPresetDto as ContestCreationPreset } from "@/lib/contests/dtos";
import type { ContestPresetDto as ContestCreationPreset } from "@/lib/contests/dtos";

export interface AdminContestWizardForm {
  name: string;
  description: string;
  mode: "blitz" | "arena";
  format: "bracket";
  bracketType?: "single_elimination" | "double_elimination";
  teamSize: 1 | 3;
  maxParticipants: number;
  startTime: string;
  registrationType: "open" | "closed";
  presetId: string;
  problemSelectionMode: "bulk" | "fine-tuned";
  problemSlots: Array<{
    platform: string;
    problemId: string;
    roundNumber: number;
    points?: number;
    timeLimitMinutes?: number;
  }>;
  bulkProblemCount?: number;
  thirdPlacePlayoff: boolean;
  seedingMethod: "cf_rating" | "manual";
  overallDurationMinutes?: number;
  perProblemDurationMinutes?: number;
}

export interface ContestParticipant {
  id: string;
  name: string;
  image?: string | null;
  pizza_count: number;
  cfHandle: string;
  cfRating: number;
  teamName?: string;
}

export function createInitialContestForm(isHead = true): ContestCreationForm {
  return {
    name: "",
    description: "",
    mode: "blitz",
    format: isHead ? "solo-tournament" : "1v1",
    teamSize: 1,
    maxParticipants: isHead ? 16 : 2,
    startTime: "",
    problemSelectionMode: "bulk",
    bulkRatingMin: 800,
    bulkRatingMax: 1200,
    bulkProblemCount: 3,
    bulkMinContestId: 0,
    fineTunedProblemCount: 1,
    fineTunedProblems: [""],
    fineTunedProblemPoints: [100],
    fineTunedProblemTimeLimits: [],
    presetId: "",
    thirdPlacePlayoff: false,
    seedingMethod: "cf_rating",
    bracketType: "single_elimination",
    registrationStartMode: "immediate",
    registrationStartTime: "",
    registrationType: isHead ? "open" : "closed",
    overallDurationMinutes: 60,
    perProblemDurationMinutes: 15,
  };
}

export function applyContestFormatDefaults(
  form: ContestCreationForm,
): ContestCreationForm {
  if (form.format === "1v1") {
    return { ...form, teamSize: 1, maxParticipants: 2 };
  }
  if (form.format === "solo-tournament") {
    return { ...form, teamSize: 1, maxParticipants: 16 };
  }
  if (form.format === "team-tournament") {
    return { ...form, teamSize: 3, maxParticipants: 15 };
  }
  if (form.format === "bracket" && form.maxParticipants < 2) {
    return { ...form, maxParticipants: 16 };
  }
  return form;
}

export function applyContestPreset(
  form: ContestCreationForm,
  preset: ContestCreationPreset,
): ContestCreationForm {
  const problemIds = preset.problemSlots?.map((slot) => slot.problemId || "");
  const points = preset.problemSlots?.map((slot) => slot.points ?? 100);
  const timeLimits = preset.problemSlots?.map(
    (slot) => slot.timeLimitMinutes ?? 15,
  );

  return {
    ...form,
    name: preset.name || form.name,
    description: preset.description || form.description,
    mode: preset.mode || form.mode,
    format: preset.format || form.format,
    problemSelectionMode:
      preset.problemSelectionMode || form.problemSelectionMode,
    bulkRatingMin: preset.bulkRatingMin || form.bulkRatingMin,
    bulkRatingMax: preset.bulkRatingMax || form.bulkRatingMax,
    bulkProblemCount: preset.bulkProblemCount || form.bulkProblemCount,
    bulkMinContestId: preset.bulkMinContestId ?? form.bulkMinContestId,
    fineTunedProblems:
      problemIds && problemIds.length > 0 ? problemIds : form.fineTunedProblems,
    fineTunedProblemPoints:
      points && points.length > 0 ? points : form.fineTunedProblemPoints,
    fineTunedProblemTimeLimits:
      timeLimits && timeLimits.length > 0
        ? timeLimits
        : form.fineTunedProblemTimeLimits,
    fineTunedProblemCount:
      problemIds && problemIds.length > 0
        ? problemIds.length
        : form.fineTunedProblemCount,
    presetId: preset.format === "bracket" ? preset._id : form.presetId,
  };
}

export function getMaxParticipantsError(
  form: ContestCreationForm,
  manualTeamCount: number,
): string {
  if (Number.isNaN(form.maxParticipants)) return "Must be a valid number.";
  if (form.format === "solo-tournament" && form.maxParticipants < 2) {
    return "At least 2 participants required.";
  }
  if (form.format === "team-tournament" && form.maxParticipants < 6) {
    return "At least 6 participants required (2 teams).";
  }
  if (form.format === "bracket" && form.maxParticipants < 2) {
    return "At least 2 participants required.";
  }

  const maxTeamsAllowed = Math.floor(form.maxParticipants / form.teamSize);
  if (manualTeamCount > maxTeamsAllowed) {
    return `Cannot be less than currently registered teams (${manualTeamCount}).`;
  }

  return "";
}

export function reorderContestEntries<T>(
  entries: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  const reordered = [...entries];
  const [entry] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, entry);
  return reordered;
}
