export type BracketPosition = string;

export type BracketNode = {
  roomId: string;
  roundNumber: number;
  matchIndex: number;
  teams: [string | null, string | null];
  teamNames: [string | null, string | null];
  teamImages?: [string | null, string | null];
  scores: [number, number];
  status: "pending" | "waiting" | "active" | "completed" | "bye";
  winner: string | null;
  bracketPosition: BracketPosition;
};

export type BracketSnapshot = {
  contestId: string;
  currentRound: number;
  totalRounds: number;
  nodes: BracketNode[];
};

export const ROUND_NAMES: Record<number, string> = {
  1: "Final",
  2: "Semi-Finals",
  3: "Quarter-Finals",
  4: "Round of 16",
  5: "Round of 32",
  6: "Round of 64",
  7: "Round of 128",
};

export function getRoundName(roundNumber: number, totalRounds: number): string {
  if (roundNumber === totalRounds) return "Final";
  if (roundNumber === totalRounds - 1) return "Semi-Finals";
  if (roundNumber === totalRounds - 2) return "Quarter-Finals";
  const participants = Math.pow(2, roundNumber + 1);
  return `Round of ${participants}`;
}

export function snakeSeed(teams: { teamId: string; seed: number }[]): { teamId: string; seed: number }[] {
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
