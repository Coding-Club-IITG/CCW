import type { BracketType } from "./types";

export * from "./types";

export function parseBracketPosition(pos: string): {
  stage: BracketType;
  roundIndex: number;
  matchIndex: number;
} {
  const match =
    /^(upper|lower|grand_final|grand_final_reset)-(\d+)-(\d+)$/.exec(pos);

  if (!match) throw new Error("Invalid bracket position");

  return {
    stage: match[1] as BracketType,
    roundIndex: Number(match[2]),
    matchIndex: Number(match[3]),
  };
}

export function getRoundName(
  roundNumber: number,
  totalRounds: number,
  bracketType?: BracketType,
): string {
  if (bracketType === "grand_final_reset") return "Grand Final (Reset)";

  if (bracketType === "grand_final") return "Grand Final";

  if (bracketType === "lower") {
    if (roundNumber === totalRounds) return "Lower Final";

    if (roundNumber === totalRounds - 1) return "Lower Semi-Finals";

    return `Lower Round ${roundNumber}`;
  }

  if (roundNumber === totalRounds) return "Final";

  if (roundNumber === totalRounds - 1) return "Semi-Finals";

  if (roundNumber === totalRounds - 2) return "Quarter-Finals";

  const participants = Math.pow(2, totalRounds - roundNumber + 1);

  return `Round of ${participants}`;
}

export function nextPowerOf2(n: number): number {
  if (n <= 1) return 2;

  return Math.pow(2, Math.ceil(Math.log2(n)));
}
