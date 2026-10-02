import type { ContestResultMethod } from "@/lib/constants";

import type { ISelectedProblem } from "@/models/ContestProblemSet";
import type {
  IContestRoom,
  IRoomProblemState,
  IRoomScore,
} from "@/models/ContestRoom";

export function openMatchProblem(
  room: IContestRoom,
  problem: ISelectedProblem,
  index: number,
  at: number,
  mode: "blitz" | "arena",
) {
  const state = room.problemStates[index];

  state.revealedAt = at;

  const limit =
    mode === "blitz"
      ? problem.timeLimitMinutes !== undefined
        ? problem.timeLimitMinutes * 60_000
        : (room.problemDurationSeconds ?? 0) * 1000
      : 0;

  if (limit) {
    state.deadlineAt = Math.min(at + limit, room.matchDeadline!.getTime());
  }
}

export function initializeMatchProblems(
  room: IContestRoom,
  problems: ISelectedProblem[],
  mode: "blitz" | "arena",
) {
  if (!problems.length) {
    throw new Error("A match requires a complete problem allocation.");
  }

  room.problemStates = problems.map((problem) => ({
    problemId: problem.problemId,
  }));
  room.currentProblemIndex = 0;

  for (
    let index = 0;
    index < (mode === "arena" ? problems.length : 1);
    index++
  ) {
    openMatchProblem(
      room,
      problems[index],
      index,
      room.actualStartTime!.getTime(),
      mode,
    );
  }
}

export function submissionWindow(
  room: Pick<IContestRoom, "matchDeadline" | "judgingGraceSeconds">,
  problem: IRoomProblemState,
  admittedAt: number,
) {
  const deadline = Math.min(
    room.matchDeadline!.getTime(),
    problem.deadlineAt ?? Infinity,
    problem.closedAt ?? Infinity,
  );

  return {
    opensAt: Math.max(problem.revealedAt ?? Infinity, admittedAt),
    deadline,
    judgingDeadline: deadline + room.judgingGraceSeconds! * 1000,
  };
}

export function decidePlayedOutcome(
  scores: IRoomScore[],
  mode: "blitz" | "arena",
  bracket: boolean,
): { winnerId: string | null; method: ContestResultMethod } {
  if (scores.length < 2) {
    throw new Error("A played match requires at least two admitted teams.");
  }

  const bestScore = Math.max(...scores.map((score) => score.score));
  let tied = scores.filter((score) => score.score === bestScore);

  if (tied.length === 1) {
    return { winnerId: tied[0].teamId, method: "score" };
  }

  if (!bracket) {
    return { winnerId: null, method: "draw" };
  }

  const comparisons: Array<[keyof IRoomScore, ContestResultMethod]> =
    mode === "arena"
      ? [
          ["penaltyTimeMs", "penalty_time"],
          ["lastSolveAt", "last_solve"],
        ]
      : [
          ["solveTimeMs", "solve_time"],
          ["wrongSubmissions", "wrong_submissions"],
        ];

  for (const [key, method] of comparisons) {
    const minimum = Math.min(...tied.map((score) => Number(score[key])));

    tied = tied.filter((score) => score[key] === minimum);

    if (tied.length === 1) {
      return { winnerId: tied[0].teamId, method };
    }
  }

  if (tied.some((score) => !score.seed)) {
    throw new Error("Bracket results require frozen seeds.");
  }

  tied.sort((a, b) => a.seed! - b.seed!);

  return { winnerId: tied[0].teamId, method: "seed" };
}
