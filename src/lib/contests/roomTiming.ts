import { workerEnv } from "@/lib/env/worker";

import type { IContestMatch } from "@/models/ContestMatch";
import type { IContestRoom } from "@/models/ContestRoom";

const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;

export function configureRoomTiming(
  room: IContestRoom,
  contest: IContestMatch,
  now = Date.now(),
) {
  room.readyOpensAt = new Date(
    Math.max(now, contest.startTime?.getTime() ?? now),
  );
  room.readyDeadline = new Date(
    room.readyOpensAt.getTime() +
      workerEnv.ROOM_READY_TIMEOUT_MINUTES *
        SECONDS_PER_MINUTE *
        MILLISECONDS_PER_SECOND,
  );
  room.durationSeconds = contest.overallDurationMinutes
    ? contest.overallDurationMinutes * SECONDS_PER_MINUTE
    : contest.durationSeconds ||
      workerEnv.CONTEST_DEFAULT_MATCH_MINUTES * SECONDS_PER_MINUTE;
  room.judgingGraceSeconds = workerEnv.CONTEST_JUDGING_GRACE_SECONDS;
  room.problemDurationSeconds =
    contest.mode === "blitz" && contest.perProblemDurationMinutes
      ? contest.perProblemDurationMinutes * SECONDS_PER_MINUTE
      : undefined;
}
