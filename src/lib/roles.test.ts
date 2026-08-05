import { describe, expect, it } from "vitest";
import {
  canSetPOTD,
  getHeadModules,
  getUserRoleLabels,
  isAdmin,
  isHead,
  normalizeTenure,
  parseManagedModules,
  parseRoles,
  validateRoles,
} from "@/lib/roles";

describe("access and role helpers", () => {
  it("implements Head and Admin access semantics", () => {
    expect(isHead("Head")).toBe(true);
    expect(isHead("Admin")).toBe(true);
    expect(isHead("Member")).toBe(false);
    expect(isAdmin("Admin")).toBe(true);
    expect(isAdmin("Head")).toBe(false);
  });
  it("strictly parses serialized arrays", () => {
    expect(parseManagedModules('["Design","unknown","Design"]')).toEqual([
      "Design",
    ]);
    expect(
      parseRoles('[{"module":"Design","position":"Head"},{"position":"OC"}]'),
    ).toHaveLength(2);
    expect(parseRoles('[{"position":"Head"}]')).toEqual([]);
  });
  it("validates role combinations and duplicates", () => {
    expect(validateRoles([{ position: "Secretary" }]).success).toBe(true);
    expect(
      validateRoles([{ module: "Design", position: "Secretary" }]).success,
    ).toBe(false);
    expect(
      validateRoles([
        { module: "Design", position: "Head" },
        { module: "Design", position: "Head" },
      ]).success,
    ).toBe(false);
  });
  it("formats assigned positions before falling back to access", () => {
    expect(
      getUserRoleLabels(
        "Admin",
        [],
        [
          { position: "Secretary" },
          { module: "Design", position: "Coordinator" },
        ],
      ),
    ).toEqual(["Secretary", "Design · Coordinator"]);
    expect(
      getUserRoleLabels("Head", '["Competitive Programming"]', "[]"),
    ).toEqual(["Competitive Programming · Head"]);
    expect(getUserRoleLabels("Admin", [], [])).toEqual(["Admin"]);
    expect(getUserRoleLabels(undefined, undefined, undefined)).toEqual([
      "Member",
    ]);
  });
  it("validates consecutive academic years", () => {
    expect(normalizeTenure(" 2026-27 ")).toBe("2026-27");
    expect(normalizeTenure("2026-28")).toBeNull();
  });
  it("uses managed modules only for Head and permits only CP Core Team POTD", () => {
    expect(getHeadModules("Head", ["Design"])).toEqual(["Design"]);
    expect(getHeadModules("Admin", ["Design"])).toEqual([]);
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
