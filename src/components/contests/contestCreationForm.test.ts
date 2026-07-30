import { describe, expect, it } from "vitest";

import {
  applyContestFormatDefaults,
  applyContestPreset,
  createInitialContestForm,
  getMaxParticipantsError,
  reorderContestEntries,
} from "@/components/contests/contestCreationForm";

describe("contest creation form domain", () => {
  it("creates a fresh form with the existing room defaults", () => {
    const first = createInitialContestForm();
    const second = createInitialContestForm();

    expect(first).toMatchObject({
      mode: "blitz",
      format: "solo-tournament",
      teamSize: 1,
      maxParticipants: 16,
      problemSelectionMode: "bulk",
      registrationStartMode: "immediate",
      registrationType: "open",
    });
    expect(first.fineTunedProblems).not.toBe(second.fineTunedProblems);
  });

  it.each([
    ["1v1", 1, 2],
    ["solo-tournament", 1, 16],
    ["team-tournament", 3, 15],
  ])(
    "applies the existing %s participant defaults",
    (format, teamSize, maxParticipants) => {
      const result = applyContestFormatDefaults({
        ...createInitialContestForm(),
        format,
        teamSize: 7,
        maxParticipants: 99,
      });

      expect(result.teamSize).toBe(teamSize);
      expect(result.maxParticipants).toBe(maxParticipants);
    },
  );

  it("keeps a valid bracket participant count", () => {
    const result = applyContestFormatDefaults({
      ...createInitialContestForm(),
      format: "bracket",
      maxParticipants: 8,
    });

    expect(result.maxParticipants).toBe(8);
  });

  it("applies preset fields without replacing unrelated form state", () => {
    const result = applyContestPreset(
      {
        ...createInitialContestForm(),
        registrationType: "closed",
      },
      {
        _id: "preset-1",
        name: "Rated Sprint",
        format: "bracket",
        problemSlots: [{ problemId: "123A" }, { problemId: "456B" }],
      },
    );

    expect(result).toMatchObject({
      name: "Rated Sprint",
      format: "bracket",
      presetId: "preset-1",
      fineTunedProblemCount: 2,
      fineTunedProblems: ["123A", "456B"],
      registrationType: "closed",
    });
  });

  it("reports when configured teams exceed participant capacity", () => {
    expect(
      getMaxParticipantsError(
        {
          ...createInitialContestForm(),
          format: "team-tournament",
          teamSize: 3,
          maxParticipants: 6,
        },
        3,
      ),
    ).toBe("Cannot be less than currently registered teams (3).");
  });

  it("moves an entry without mutating the source array", () => {
    const source = ["a", "b", "c"];

    expect(reorderContestEntries(source, 0, 2)).toEqual(["b", "c", "a"]);
    expect(source).toEqual(["a", "b", "c"]);
  });
});
