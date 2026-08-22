import { describe, expect, it } from "vitest";

import { APP_TIME_ZONE } from "@/lib/constants";
import {
  AGENDA_JOB_SCHEDULES,
  AGENDA_SCHEDULE_OPTIONS,
  NIGHTLY_CF_PROBLEM_SCHEDULE,
} from "@/lib/jobs/schedules";

describe("background job schedules", () => {
  it("pins both schedulers to the application timezone", () => {
    expect(APP_TIME_ZONE).toBe("Asia/Kolkata");
    expect(AGENDA_SCHEDULE_OPTIONS.timezone).toBe(APP_TIME_ZONE);
    expect(NIGHTLY_CF_PROBLEM_SCHEDULE.tz).toBe(APP_TIME_ZONE);
  });

  it("keeps the POTD sync after the nightly grace window", () => {
    expect(AGENDA_JOB_SCHEDULES).toContainEqual({
      interval: "0 5 2 * * *",
      name: "sync-potd-submissions",
    });
  });
});
