export function getRoundName(roundNumber: number, totalRounds: number): string {
  if (roundNumber === totalRounds) return "Final";
  if (roundNumber === totalRounds - 1) return "Semi-Finals";
  if (roundNumber === totalRounds - 2) return "Quarter-Finals";
  const participants = Math.pow(2, roundNumber + 1);
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
