import { describe, expect, it } from "vitest";
import { getHeadModules, isAdmin, isHead } from "@/lib/access/roles";
import { canSetPOTD } from "@/lib/access/potd";

describe("access policies", () => {
  it("implements Head and Admin access semantics", () => {
    expect(isHead("Head")).toBe(true);
    expect(isHead("Admin")).toBe(true);
    expect(isHead("Member")).toBe(false);
    expect(isAdmin("Admin")).toBe(true);
    expect(isAdmin("Head")).toBe(false);
  });

  it("uses managed modules only for Head", () => {
    expect(getHeadModules("Head", ["Design"])).toEqual(["Design"]);
    expect(getHeadModules("Admin", ["Design"])).toEqual([]);
  });

  it("permits only Head-level users and CP Core Team to set POTD", () => {
    expect(canSetPOTD("Head")).toBe(true);
    expect(
      canSetPOTD("Member", [
        { module: "Competitive Programming", position: "Core Team" },
      ]),
    ).toBe(true);
    expect(
      canSetPOTD("Member", [{ module: "Design", position: "Core Team" }]),
    ).toBe(false);
  });
});
