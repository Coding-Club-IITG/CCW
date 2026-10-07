import { describe, expect, it } from "vitest";
import { getModules, isAdmin, isHead, isElevated } from "@/lib/access/roles";
import type { ModuleName } from "@/lib/constants";

describe("access policies", () => {
  it.each([
    ["Member", false, false, false],
    ["Core Team", true, false, false],
    ["Head", true, true, false],
    ["Admin", true, true, true],
    ["unknown", false, false, false],
    ["", false, false, false],
    [undefined, false, false, false],
  ])("checks %s explicitly", (access, elevated, head, admin) => {
    expect(isElevated(access)).toBe(elevated);
    expect(isHead(access)).toBe(head);
    expect(isAdmin(access)).toBe(admin);
  });
  it.each(["Head", "Core Team"])(
    "returns only assigned current modules for %s",
    (access) => {
      expect(
        getModules(access, [
          "Design",
          "Design",
          "Web Development" as ModuleName,
        ]),
      ).toEqual(["Design"]);
      expect(getModules(access)).toEqual([]);
    },
  );
  it.each(["Member", "Admin", "unknown", undefined])(
    "has no module scope for %s",
    (access) => {
      expect(getModules(access, ["Design"])).toEqual([]);
    },
  );
});
