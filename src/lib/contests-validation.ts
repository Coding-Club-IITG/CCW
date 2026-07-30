export type BracketRegisteredUser = {
  id?: string;
  teamName?: string;
};

export type BracketContestInput = {
  teamSize: unknown;
  maxParticipants: unknown;
  registrationType: unknown;
  registeredUsers?: BracketRegisteredUser[];
  seedingMethod?: unknown;
};

export type BracketInputValidationResult =
  | { success: true }
  | { success: false; error: string };

export function validateBracketContestInput(
  data: BracketContestInput,
): BracketInputValidationResult {
  const teamSize = Number(data.teamSize);
  if (teamSize !== 1 && teamSize !== 3) {
    return {
      success: false,
      error: "Team size must be either 1 or 3.",
    };
  }

  const maxParticipants = Number(data.maxParticipants);
  if (!Number.isInteger(maxParticipants) || maxParticipants < 2) {
    return {
      success: false,
      error: "Maximum participants must be an integer of at least 2.",
    };
  }
  if (teamSize === 3 && maxParticipants < teamSize * 2) {
    return {
      success: false,
      error: "Team brackets require capacity for at least two complete teams.",
    };
  }
  if (maxParticipants % teamSize !== 0) {
    return {
      success: false,
      error: `Maximum participants must be divisible by the team size (${teamSize}).`,
    };
  }

  if (data.registrationType !== "open" && data.registrationType !== "closed") {
    return {
      success: false,
      error: "Registration type must be 'open' or 'closed'.",
    };
  }
  if (
    data.seedingMethod !== undefined &&
    data.seedingMethod !== "cf_rating" &&
    data.seedingMethod !== "manual"
  ) {
    return {
      success: false,
      error: "Seeding method must be either 'cf_rating' or 'manual'.",
    };
  }

  const registeredUsers = data.registeredUsers ?? [];
  if (!Array.isArray(registeredUsers)) {
    return {
      success: false,
      error: "Registered users must be an array.",
    };
  }
  if (registeredUsers.length > maxParticipants) {
    return {
      success: false,
      error: "Registered users cannot exceed the participant limit.",
    };
  }

  const userIds = registeredUsers.map((user) => user.id);
  if (new Set(userIds).size !== userIds.length) {
    return {
      success: false,
      error: "Each registered user may appear only once.",
    };
  }

  if (data.registrationType === "closed") {
    if (registeredUsers.length < teamSize * 2) {
      return {
        success: false,
        error:
          teamSize === 1
            ? "Closed brackets require at least 2 participants."
            : "Closed team brackets require at least two complete teams.",
      };
    }

    if (teamSize > 1) {
      const teamCounts = new Map<string, number>();
      for (const user of registeredUsers) {
        const teamName = user.teamName?.trim();
        if (!teamName) {
          return {
            success: false,
            error: "Every registered team member must have a team name.",
          };
        }
        teamCounts.set(teamName, (teamCounts.get(teamName) ?? 0) + 1);
      }
      if ([...teamCounts.values()].some((count) => count !== teamSize)) {
        return {
          success: false,
          error: `Every team must contain exactly ${teamSize} members.`,
        };
      }
    }
  } else if (registeredUsers.length > 0) {
    return {
      success: false,
      error: "Open brackets cannot include pre-registered users.",
    };
  }

  return { success: true };
}
