import { CONTEST_TIMING } from "@/lib/constants";

export type ContestRegistrationTiming = {
  deadlineMinutes: number;
  startBufferSeconds: number;
  startToleranceSeconds: number;
};

export function contestRegistrationTiming(env: {
  REGISTRATION_DEADLINE_MINUTES: number;
}): ContestRegistrationTiming {
  return {
    deadlineMinutes: env.REGISTRATION_DEADLINE_MINUTES,
    startBufferSeconds: CONTEST_TIMING.startBufferSeconds,
    startToleranceSeconds: CONTEST_TIMING.startToleranceSeconds,
  };
}

export function contestStartTimeError(
  startTime: string,
  isCasual1v1: boolean,
  timing: ContestRegistrationTiming,
  now = Date.now(),
): string | null {
  const startMs = new Date(startTime).getTime();

  if (!Number.isFinite(startMs)) {
    return "A valid start time is required.";
  }

  const bufferSeconds =
    timing.startBufferSeconds + (isCasual1v1 ? 0 : timing.deadlineMinutes * 60);

  if (startMs < now + (bufferSeconds - timing.startToleranceSeconds) * 1000) {
    return `Start time must be at least ${bufferSeconds} seconds in the future.`;
  }

  return null;
}
