import type { ContestRoomProblemDto } from "@/lib/contests/dtos";

import type { ISelectedProblem } from "@/models/ContestProblemSet";
import type { IContestRoom } from "@/models/ContestRoom";

type SnapshotRoom = Pick<
  IContestRoom,
  | "status"
  | "contestId"
  | "currentProblemIndex"
  | "gameplayEndedAt"
  | "judgingDeadline"
  | "participationRevision"
  | "actualStartTime"
  | "durationSeconds"
  | "readyOpensAt"
  | "readyDeadline"
  | "matchDeadline"
  | "problemDurationSeconds"
  | "scoreStats"
  | "problemStates"
>;

// Pages, reconnects and Redis replay use the same persisted revision
export function roomGameplaySnapshot(
  room: SnapshotRoom,
  mode: string,
  selected: ISelectedProblem[],
) {
  const state: Record<string, string> = {
    status: room.status === "ended" ? "completed" : room.status,
    type: mode,
    contestId: String(room.contestId),
    currentProblem: String(room.currentProblemIndex),
    gameplayEndedAt: room.gameplayEndedAt
      ? String(room.gameplayEndedAt.getTime())
      : "",
    judgingDeadline: room.judgingDeadline
      ? String(room.judgingDeadline.getTime())
      : "",
    participationRevision: String(room.participationRevision),
    startTime: room.actualStartTime
      ? String(room.actualStartTime.getTime())
      : "",
    timeLimit: String(room.durationSeconds ?? ""),
    readyOpensAt: room.readyOpensAt ? String(room.readyOpensAt.getTime()) : "",
    readyDeadline: room.readyDeadline
      ? String(room.readyDeadline.getTime())
      : "",
    matchDeadline: room.matchDeadline
      ? String(room.matchDeadline.getTime())
      : "",
    problemTimeLimit: String(room.problemDurationSeconds ?? ""),
  };
  const scores = Object.fromEntries(
    room.scoreStats.map((score) => [score.teamId, score.score]),
  );
  const locks = Object.fromEntries(
    room.problemStates.flatMap((problem) =>
      problem.claim
        ? [
            [
              problem.problemId,
              problem.claim.teamId + "|" + problem.claim.submittedAt,
            ],
          ]
        : [],
    ),
  );
  const problems: ContestRoomProblemDto[] = selected.map((problem, index) => {
    const progress = room.problemStates[index];

    return {
      problemId: problem.problemId,
      name: problem.name,
      rating: problem.rating,
      points: problem.points,
      revealedAt: progress?.revealedAt ?? null,
      deadlineAt: progress?.deadlineAt ?? null,
      closedAt: progress?.closedAt ?? null,
      statementHtml: problem.statementHtml,
      inputSpecificationHtml: problem.inputSpecificationHtml,
      outputSpecificationHtml: problem.outputSpecificationHtml,
      constraintsHtml: problem.constraintsHtml,
      notesHtml: problem.notesHtml,
      samples: problem.samples?.map(({ input, output }) => ({ input, output })),
      timeLimitMs: problem.timeLimitMs,
      memoryLimitMb: problem.memoryLimitMb,
    };
  });

  return { state, scores, locks, problems };
}
