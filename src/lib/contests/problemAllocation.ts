import {
  bracketProblemRequirements,
  buildBracketTopology,
  type EliminationType,
} from "@/lib/contests/bracketTopology";

export interface ProblemAllocationConfig {
  format: string;
  problemSelectionMode: string;
  bulkProblemCount?: number;
  entrantCapacity?: number;
  bracketType?: EliminationType;
  problemSlots?: Array<{
    platform: string;
    problemId?: string;
    roundNumber?: number;
    points?: number;
    timeLimitMinutes?: number;
  }>;
}

export function problemAllocationError(
  config: ProblemAllocationConfig,
): string | null {
  if (config.problemSelectionMode !== "fine-tuned") return null;

  const slots = config.problemSlots ?? [];

  if (!slots.length) return "Manual problem allocations are required.";

  const ids = new Set<string>();

  for (const slot of slots) {
    const id = slot.problemId?.trim().toUpperCase();

    if (
      slot.platform !== "codeforces" ||
      !id ||
      !/^\d+[A-Z][A-Z0-9]*$/.test(id)
    ) {
      return "Each allocation requires a valid Codeforces problem ID.";
    }

    if (ids.has(id))
      return `Problem ${id} is allocated more than once. Use fresh problems for every match and reset.`;

    ids.add(id);
  }

  if (config.format !== "bracket") return null;

  if (
    !config.entrantCapacity ||
    !Number.isInteger(config.entrantCapacity) ||
    config.entrantCapacity > 256 ||
    config.entrantCapacity <
      (config.bracketType === "double_elimination" ? 4 : 2)
  )
    return "A valid entrant capacity is required for bracket allocations.";

  const requirements = bracketProblemRequirements(
    config.entrantCapacity,
    config.bracketType ?? "single_elimination",
    config.bulkProblemCount ?? 3,
  );

  for (const round of requirements) {
    if (
      slots.filter((slot) => slot.roundNumber === round.roundNumber).length !==
      round.problemCount
    ) {
      return `${round.name} requires exactly ${round.problemCount} fresh problems.`;
    }
  }

  if (
    slots.some(
      (slot) =>
        !requirements.some((round) => round.roundNumber === slot.roundNumber),
    )
  ) {
    return "Problem allocations contain an unknown or non-playing round.";
  }

  return null;
}

// Keep finals and reset reserves aligned when fewer entrants register
export function configuredAllocationRound(
  match: ReturnType<typeof buildBracketTopology>["matches"][number],
  actual: ReturnType<typeof buildBracketTopology>,
  configured: ReturnType<typeof buildBracketTopology>,
) {
  const offset =
    match.stage === "upper"
      ? configured.upperRounds - actual.upperRounds
      : match.stage === "lower"
        ? configured.lowerRounds - actual.lowerRounds
        : 0;
  const source = configured.matches.find(
    (candidate) =>
      candidate.stage === match.stage &&
      candidate.roundIndex === match.roundIndex + offset,
  );

  if (!source)
    throw new Error(`No configured allocation for ${match.roundName}.`);

  return source.roundNumber;
}
