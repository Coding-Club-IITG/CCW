import { describe, expect, it } from "vitest";

import {
  canSetPOTD,
  cleanUserRoles,
  getHeadModules,
  isAdmin,
  isGlobalAdmin,
  parseModuleRoles,
} from "@/lib/roles";

describe("parseModuleRoles", () => {
  it("accepts valid array and JSON boundaries while dropping malformed entries", () => {
    const roles = [
      { module: "Software Development", role: "Coordinator" },
      { module: "Design" },
      { module: 42, role: "Member" },
      null,
    ];

    expect(parseModuleRoles(roles)).toEqual(roles.slice(0, 2));
    expect(parseModuleRoles(JSON.stringify(roles))).toEqual(roles.slice(0, 2));
  });

  it("returns an empty list for malformed JSON or non-array JSON", () => {
    expect(parseModuleRoles("{")).toEqual([]);
    expect(parseModuleRoles('{"module":"Design"}')).toEqual([]);
  });
});

describe("authorization helpers", () => {
  it("distinguishes global administrators from module heads and core members", () => {
    expect(isGlobalAdmin("Secretary")).toBe(true);
    expect(isGlobalAdmin("Head")).toBe(false);
    expect(isAdmin("Head")).toBe(true);
    expect(isAdmin("Core Team")).toBe(false);
  });

  it("allows administrators and core team members to set POTD", () => {
    expect(canSetPOTD("Projects Head")).toBe(true);
    expect(canSetPOTD("Core Team")).toBe(true);
    expect(canSetPOTD("Member")).toBe(false);
  });

  it("returns module ownership only for heads", () => {
    const moduleRoles = [{ module: "Design", role: "Coordinator" }];

    expect(getHeadModules("Head", moduleRoles)).toEqual(["Design"]);
    expect(getHeadModules("Member", moduleRoles)).toEqual([]);
  });

  it("removes incompatible module roles when global roles change", () => {
    const moduleRoles = [{ module: "Design", role: "Coordinator" }];

    expect(cleanUserRoles("Secretary", moduleRoles)).toEqual([]);
    expect(cleanUserRoles("Head", moduleRoles)).toEqual([{ module: "Design" }]);
    expect(cleanUserRoles("Member", moduleRoles)).toEqual(moduleRoles);
  });
});
