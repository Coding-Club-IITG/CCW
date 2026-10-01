import type { BracketType } from "./types";

export * from "./types";

export const ROUND_NAMES: Record<number, string> = {
  1: "Final",
  2: "Semi-Finals",
  3: "Quarter-Finals",
  4: "Round of 16",
  5: "Round of 32",
  6: "Round of 64",
  7: "Round of 128",
};

export function parseBracketPosition(pos: string): {
  stage: BracketType;
  roundIndex: number;
  matchIndex: number;
} {
  const parts = pos.split("-");
  if (parts.length === 3) {
    let stage = parts[0] as BracketType;
    if ((stage as string) === "gf") {
      stage =
        parseInt(parts[1], 10) === 1 ? "grand_final_reset" : "grand_final";
    }
    return {
      stage,
      roundIndex: parseInt(parts[1], 10),
      matchIndex: parseInt(parts[2], 10),
    };
  }
  return {
    stage: "upper",
    roundIndex: parseInt(parts[0], 10),
    matchIndex: parseInt(parts[1], 10),
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

export function snakeSeed(
  teams: { teamId: string; seed: number }[],
): { teamId: string; seed: number }[] {
  const sorted = [...teams].sort((a, b) => a.seed - b.seed);
  const n = sorted.length;
  const result: { teamId: string; seed: number }[] = [];
  let left = 0;
  let right = n - 1;
  let fromLeft = true;
  while (left <= right) {
    if (fromLeft) {
      result.push(sorted[left]);
      left++;
    } else {
      result.push(sorted[right]);
      right--;
    }
    fromLeft = !fromLeft;
  }
  return result;
}

export function nextPowerOf2(n: number): number {
  if (n <= 1) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}
