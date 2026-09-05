import { describe, expect, it } from "vitest";

import {
  contestCreationDraftSchema,
  contestCreationPayloadSchema,
  validateBracketContestInput,
} from "@/lib/api/schemas/contestAction";

const USER_ONE = "507f1f77bcf86cd799439011";
const USER_TWO = "507f191e810c19729de860ea";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: "August bracket",
    description: "A short contest",
    mode: "blitz",
    format: "bracket",
    teamSize: 1,
    maxParticipants: 16,
    startTime: "2026-08-24T12:00:00.000Z",
    registrationType: "open",
    problemSelectionMode: "bulk",
    bulkRatingMin: 800,
    bulkRatingMax: 1400,
    bulkProblemCount: 3,
    ...overrides,
  };
}

describe("contest creation payload", () => {
  it("allows unfinished date input while validating wizard drafts", () => {
    expect(
      contestCreationDraftSchema.safeParse({
        name: "Draft bracket",
        mode: "blitz",
        teamSize: 1,
        startTime: "",
      }).success,
    ).toBe(true);
  });

  it("applies wire defaults and strips unknown fields", () => {
    const result = contestCreationPayloadSchema.parse(
      validPayload({ internalFlag: true }),
    );

    expect(result).toMatchObject({
      format: "bracket",
      problemSelectionMode: "bulk",
      bulkPlatform: "codeforces",
      problemSlots: [],
      registeredUsers: [],
      thirdPlacePlayoff: false,
      seedingMethod: "cf_rating",
    });
    expect(result).not.toHaveProperty("internalFlag");
  });

  it("rejects malformed IDs, dates, and oversized problem arrays", () => {
    expect(
      contestCreationPayloadSchema.safeParse(
        validPayload({
          presetId: "not-an-object-id",
          startTime: "not-a-date",
          problemSlots: Array.from({ length: 101 }, (_, index) => ({
            platform: "codeforces",
            problemId: `${index + 1}A`,
          })),
        }),
      ).success,
    ).toBe(false);
  });
});

describe("bracket contest invariants", () => {
  it("rejects duplicate closed registrations", () => {
    expect(
      validateBracketContestInput({
        teamSize: 1,
        maxParticipants: 2,
        registrationType: "closed",
        seedingMethod: "cf_rating",
        registeredUsers: [
          { id: USER_ONE, cfHandle: "one" },
          { id: USER_ONE, cfHandle: "one-again" },
        ],
      }),
    ).toEqual({
      success: false,
      error: "Each registered user may appear only once.",
    });
  });

  it("accepts two complete closed teams", () => {
    expect(
      validateBracketContestInput({
        teamSize: 1,
        maxParticipants: 2,
        registrationType: "closed",
        seedingMethod: "manual",
        registeredUsers: [
          { id: USER_ONE, cfHandle: "one" },
          { id: USER_TWO, cfHandle: "two" },
        ],
      }),
    ).toEqual({ success: true });
  });

  it("parses double elimination bracketType, duration, and problem slot points/timeLimit", () => {
    const payload = validPayload({
      bracketType: "double_elimination",
      overallDurationMinutes: 120,
      perProblemDurationMinutes: 15,
      problemSlots: [
        {
          platform: "codeforces",
          problemId: "1000A",
          points: 250,
          timeLimitMinutes: 20,
        },
      ],
    });

    const parsed = contestCreationPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.bracketType).toBe("double_elimination");
      expect(parsed.data.overallDurationMinutes).toBe(120);
      expect(parsed.data.perProblemDurationMinutes).toBe(15);
      expect(parsed.data.problemSlots[0].points).toBe(250);
      expect(parsed.data.problemSlots[0].timeLimitMinutes).toBe(20);
    }
  });
});
