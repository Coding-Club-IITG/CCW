import { CONTEST_TIMING } from "@/lib/constants";

import { workerEnv } from "@/lib/env/worker";

import type { IContestMatch } from "@/models/ContestMatch";
import type { IContestRoom } from "@/models/ContestRoom";

export function configureRoomTiming(
  room: IContestRoom,
  contest: IContestMatch,
  now = Date.now(),
) {
  room.readyOpensAt = new Date(
    Math.max(now, contest.startTime?.getTime() ?? now),
  );
  room.readyDeadline = new Date(
    room.readyOpensAt.getTime() + workerEnv.ROOM_READY_TIMEOUT_MINUTES * 60_000,
  );
  room.durationSeconds = contest.overallDurationMinutes
    ? contest.overallDurationMinutes * 60
    : contest.durationSeconds || workerEnv.CONTEST_DEFAULT_MATCH_MINUTES * 60;
  room.judgingGraceSeconds = workerEnv.CONTEST_JUDGING_GRACE_SECONDS;
  room.arenaWrongPenaltySeconds = CONTEST_TIMING.arenaWrongPenaltyMinutes * 60;
  room.problemDurationSeconds =
    contest.mode === "blitz" && contest.perProblemDurationMinutes
      ? contest.perProblemDurationMinutes * 60
      : undefined;
}
