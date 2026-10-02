export type ContestRegistrationTiming = {
  deadlineMinutes: number;
  startBufferSeconds: number;
  startToleranceSeconds: number;
};

const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;

export function contestRegistrationTiming(env: {
  REGISTRATION_DEADLINE_MINUTES: number;
  CONTEST_START_BUFFER_SECONDS: number;
  CONTEST_START_TOLERANCE_SECONDS: number;
}): ContestRegistrationTiming {
  return {
    deadlineMinutes: env.REGISTRATION_DEADLINE_MINUTES,
    startBufferSeconds: env.CONTEST_START_BUFFER_SECONDS,
    startToleranceSeconds: env.CONTEST_START_TOLERANCE_SECONDS,
  };
}

export function contestStartTimeError(
  startTime: string,
  isCasual1v1: boolean,
  timing: ContestRegistrationTiming,
  now = Date.now(),
): string | null {
  const startMs = new Date(startTime).getTime();
  if (!Number.isFinite(startMs)) return "A valid start time is required.";
  const bufferSeconds =
    timing.startBufferSeconds +
    (isCasual1v1 ? 0 : timing.deadlineMinutes * SECONDS_PER_MINUTE);
  if (
    startMs <
    now +
      (bufferSeconds - timing.startToleranceSeconds) * MILLISECONDS_PER_SECOND
  ) {
    return `Start time must be at least ${bufferSeconds} seconds in the future.`;
  }
  return null;
}
