import { getRoundName, nextPowerOf2 } from "@/lib/contests/bracketLayout";
import type { BracketType } from "@/lib/contests/types";

export type EliminationType = "single_elimination" | "double_elimination";

export type BracketSource =
  | { kind: "seed"; seed: number }
  | { kind: "winner" | "loser"; position: string };

export type BracketDestination = { position: string; slot: 0 | 1 };

export type TopologyMatch = {
  position: string;
  stage: BracketType;
  roundIndex: number;
  roundNumber: number;
  matchIndex: number;
  roundName: string;
  sources: [BracketSource, BracketSource];
  winnerTo?: BracketDestination;
  loserTo?: BracketDestination;
  playable: boolean;
  conditional: boolean;
};

export function minimumBracketEntrants(type: EliminationType) {
  return type === "double_elimination" ? 4 : 2;
}

export function bracketCapacityError(input: {
  format?: string;
  teamSize?: number;
  registrationSettings?: { entrantCapacity?: number; maxParticipants: number };
  bracketSettings?: { type?: EliminationType };
}) {
  if (input.format !== "bracket") {
    return null;
  }

  const capacity = input.registrationSettings?.entrantCapacity;
  const minimum = minimumBracketEntrants(
    input.bracketSettings?.type || "single_elimination",
  );

  if (
    !capacity ||
    !Number.isInteger(capacity) ||
    capacity < minimum ||
    capacity > 256
  ) {
    return `This bracket requires capacity for ${minimum}-256 entrants.`;
  }

  if (
    input.registrationSettings?.maxParticipants !==
    capacity * (input.teamSize || 1)
  ) {
    return "Participant capacity must equal entrant capacity times team size.";
  }

  return null;
}

export function seededBracketOrder(size: number): number[] {
  if (size < 2 || !Number.isInteger(Math.log2(size))) {
    throw new Error("Bracket size must be a power of two.");
  }

  let order = [1, 2];

  for (let width = 4; width <= size; width *= 2) {
    order = order.flatMap((seed) => [seed, width + 1 - seed]);
  }

  return order;
}

// Build sources before destinations so byes can be resolved in graph order
export function buildBracketTopology(entrants: number, type: EliminationType) {
  if (
    !Number.isInteger(entrants) ||
    entrants < minimumBracketEntrants(type) ||
    entrants > 256
  ) {
    throw new Error(
      `This bracket requires ${minimumBracketEntrants(type)}-256 entrants.`,
    );
  }

  const size = nextPowerOf2(entrants);
  const upperRounds = Math.log2(size);
  const lowerRounds = type === "double_elimination" ? 2 * (upperRounds - 1) : 0;
  const order = seededBracketOrder(size);
  const matches: TopologyMatch[] = [];
  const upper = (round: number, match: number) => `upper-${round}-${match}`;
  const lower = (round: number, match: number) => `lower-${round}-${match}`;
  const result = (
    kind: "winner" | "loser",
    position: string,
  ): BracketSource => ({ kind, position });
  const add = (
    stage: BracketType,
    roundIndex: number,
    matchIndex: number,
    sources: [BracketSource, BracketSource],
  ) => {
    const roundNumber =
      stage === "upper"
        ? roundIndex + 1
        : stage === "lower"
          ? upperRounds + roundIndex + 1
          : upperRounds + lowerRounds + (stage === "grand_final" ? 1 : 2);
    const position =
      stage === "upper"
        ? upper(roundIndex, matchIndex)
        : `${stage}-${roundIndex}-${matchIndex}`;

    matches.push({
      position,
      stage,
      roundIndex,
      roundNumber,
      matchIndex,
      sources,
      roundName: getRoundName(
        roundIndex + 1,
        stage === "upper" ? upperRounds : lowerRounds,
        stage,
      ),
      playable: false,
      conditional: stage === "grand_final_reset",
    });
  };

  for (let round = 0; round < upperRounds; round++) {
    for (let match = 0; match < size / 2 ** (round + 1); match++) {
      add(
        "upper",
        round,
        match,
        round === 0
          ? [
              { kind: "seed", seed: order[2 * match] },
              { kind: "seed", seed: order[2 * match + 1] },
            ]
          : [
              result("winner", upper(round - 1, 2 * match)),
              result("winner", upper(round - 1, 2 * match + 1)),
            ],
      );
    }
  }

  for (let round = 0; round < lowerRounds; round++) {
    const count = size / 2 ** (Math.floor(round / 2) + 2);

    for (let match = 0; match < count; match++) {
      // Cross upper losers into the opposite lower match to avoid immediate rematches
      const sources: [BracketSource, BracketSource] =
        round === 0
          ? [
              result("loser", upper(0, 2 * match)),
              result("loser", upper(0, 2 * match + 1)),
            ]
          : round % 2 === 1
            ? [
                result("winner", lower(round - 1, match)),
                result(
                  "loser",
                  upper((round + 1) / 2, count > 1 ? match ^ 1 : match),
                ),
              ]
            : [
                result("winner", lower(round - 1, 2 * match)),
                result("winner", lower(round - 1, 2 * match + 1)),
              ];

      add("lower", round, match, sources);
    }
  }

  if (type === "double_elimination") {
    // Reserve reset slots now and activate them only after a lower finalist wins
    add("grand_final", 0, 0, [
      result("winner", upper(upperRounds - 1, 0)),
      result("winner", lower(lowerRounds - 1, 0)),
    ]);
    add("grand_final_reset", 0, 0, [
      result("loser", "grand_final-0-0"),
      result("winner", "grand_final-0-0"),
    ]);
  }

  const byPosition = new Map(matches.map((match) => [match.position, match]));
  const possible = new Map<string, { winner: boolean; loser: boolean }>();

  // Structural byes produce winners but never losers or problem allocations
  for (const match of matches) {
    const present = match.sources.map((source, index) => {
      if (source.kind === "seed") {
        return source.seed <= entrants;
      }

      const origin = byPosition.get(source.position)!;
      const key = source.kind === "winner" ? "winnerTo" : "loserTo";

      if (origin[key]) {
        throw new Error("Bracket output has multiple destinations.");
      }

      origin[key] = { position: match.position, slot: index as 0 | 1 };

      return possible.get(source.position)![source.kind];
    });

    match.playable = present.every(Boolean);
    possible.set(match.position, {
      winner: present.some(Boolean),
      loser: match.playable,
    });
  }

  return { size, upperRounds, lowerRounds, matches };
}

export function bracketProblemRequirements(
  entrants: number,
  type: EliminationType,
  problemsPerMatch: number,
) {
  const topology = buildBracketTopology(entrants, type);
  const rounds = new Map<
    number,
    {
      roundNumber: number;
      name: string;
      stage: BracketType;
      positions: string[];
      problemCount: number;
    }
  >();

  for (const match of topology.matches) {
    if (!match.playable) {
      continue;
    }

    const round = rounds.get(match.roundNumber) ?? {
      roundNumber: match.roundNumber,
      name: match.roundName,
      stage: match.stage,
      positions: [],
      problemCount: 0,
    };

    round.positions.push(match.position);
    round.problemCount += problemsPerMatch;
    rounds.set(match.roundNumber, round);
  }

  return [...rounds.values()];
}
