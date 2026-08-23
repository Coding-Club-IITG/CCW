import { describe, expect, it } from "vitest";
import {
  atlasDateRange,
  atlasMatchScore,
  parseAtlasQuery,
} from "@/lib/atlas/query";

describe("Club Atlas queries", () => {
  it("keeps quoted phrases and parses discoverable filters", () => {
    const result = parseAtlasQuery(
      '"club app" type:projects module:"Machine Learning" tag:Tutorial year:2026',
    );

    expect(result).toMatchObject({
      text: "club app",
      phrases: ["club app"],
      filters: {
        kinds: ["project"],
        module: "Machine Learning",
        tag: "Tutorial",
        year: 2026,
      },
    });
  });

  it("ignores invalid filters without turning them into unsafe expressions", () => {
    expect(parseAtlasQuery("type:unknown module:Unknown year:soon")).toEqual({
      text: "",
      phrases: [],
      filters: { kinds: [] },
    });
  });

  it("builds bounded date ranges", () => {
    expect(
      atlasDateRange(parseAtlasQuery("year:2025 after:2025-02-01")),
    ).toEqual({
      $gte: new Date("2025-02-01T00:00:00.000Z"),
      $lt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("ranks exact and prefix title matches ahead of metadata matches", () => {
    expect(atlasMatchScore("Design", [], "design").score).toBeGreaterThan(
      atlasMatchScore("Design Systems", [], "design").score,
    );
    expect(
      atlasMatchScore("Visual language", ["Design"], "design").score,
    ).toBeLessThan(atlasMatchScore("Design Systems", [], "design").score);
  });
});
