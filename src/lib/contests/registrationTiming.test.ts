import { describe, expect, it } from "vitest";

import {
  contestRegistrationTiming,
  contestStartTimeError,
} from "./registrationTiming";

describe("contest scheduling timing", () => {
  const now = Date.parse("2030-01-01T00:00:00Z");
  const timing = contestRegistrationTiming({
    REGISTRATION_DEADLINE_MINUTES: 3,
    CONTEST_START_BUFFER_SECONDS: 120,
    CONTEST_START_TOLERANCE_SECONDS: 10,
  });
  it("uses configured buffer and tolerance for both casual and scheduled matches", () => {
    for (const casual of [true, false]) {
      const earliest = now + (casual ? 110 : 290) * 1000;
      expect(
        contestStartTimeError(
          new Date(earliest).toISOString(),
          casual,
          timing,
          now,
        ),
      ).toBeNull();
      expect(
        contestStartTimeError(
          new Date(earliest - 1).toISOString(),
          casual,
          timing,
          now,
        ),
      ).toMatch(/Start time/);
    }
  });
  it("rejects invalid dates and exposes only required non-secret values", () => {
    expect(contestStartTimeError("invalid", false, timing, now)).toMatch(
      /valid start/,
    );
    expect(timing).toEqual({
      deadlineMinutes: 3,
      startBufferSeconds: 120,
      startToleranceSeconds: 10,
    });
  });
});
