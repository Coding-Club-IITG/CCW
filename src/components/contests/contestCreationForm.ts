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
  presetId: string;
  thirdPlacePlayoff: boolean;
  seedingMethod: string;
  registrationStartMode: string;
  registrationStartTime: string;
  registrationType: string;
}

export interface ContestCreationPreset {
  _id: string;
  name?: string;
  description?: string;
  mode?: string;
  format?: string;
  problemSelectionMode?: string;
  bulkRatingMin?: number;
  bulkRatingMax?: number;
  bulkProblemCount?: number;
  bulkMinContestId?: number;
  problemSlots?: Array<{ problemId?: string }>;
}

export function createInitialContestForm(): ContestCreationForm {
  return {
    name: "",
    description: "",
    mode: "blitz",
    format: "solo-tournament",
    teamSize: 1,
    maxParticipants: 16,
    startTime: "",
    problemSelectionMode: "bulk",
    bulkRatingMin: 800,
    bulkRatingMax: 1200,
    bulkProblemCount: 3,
    bulkMinContestId: 0,
    fineTunedProblemCount: 1,
    fineTunedProblems: [""],
    presetId: "",
    thirdPlacePlayoff: false,
    seedingMethod: "cf_rating",
    registrationStartMode: "immediate",
    registrationStartTime: "",
    registrationType: "open",
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
