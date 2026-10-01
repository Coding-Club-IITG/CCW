import { describe, expect, it } from "vitest";

import { computePoints } from "@/lib/potd/scoring";

describe("POTD scoring", () => {
  it("awards base points plus five percent per entering streak day", () => {
    expect(computePoints(1000, 100, 100, 200, 4)).toBe(120);
  });

  it("caps the streak bonus at ten days", () => {
    expect(computePoints(1000, 100, 100, 200, 20)).toBe(150);
  });

  it("awards half base points during grace with no streak bonus", () => {
    expect(computePoints(1000, 150, 100, 200, 10)).toBe(50);
  });

  it("awards no points after grace or for a negative rating", () => {
    expect(computePoints(1000, 201, 100, 200, 10)).toBe(0);
    expect(computePoints(-500, 100, 100, 200, 10)).toBe(0);
  });
});
