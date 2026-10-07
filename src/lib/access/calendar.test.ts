import { describe, expect, it } from "vitest";
import {
  canManageCalendarEvent,
  canPublishCalendarEvent,
  getCreatableCalendarScopes,
  getPublishableEventModules,
} from "@/lib/access/calendar";

describe("calendar access", () => {
  it.each(["Core Team", "Member", "unknown", undefined])(
    "denies %s even with assigned modules",
    (access) => {
      expect(
        canManageCalendarEvent(access, ["Design"], {
          scope: "module",
          module: "Design",
        }),
      ).toBe(false);
      expect(
        canPublishCalendarEvent(access, ["Design"], {
          scope: "module",
          module: "Design",
        }),
      ).toBe(false);
      expect(getCreatableCalendarScopes(access, ["Design"])).toEqual([]);
      expect(getPublishableEventModules(access, ["Design"])).toEqual([]);
    },
  );
  it("scopes Heads and grants Admin club-wide publishing", () => {
    expect(getPublishableEventModules("Head", ["Design"])).toEqual(["Design"]);
    expect(getPublishableEventModules("Admin", [])).toBeNull();
    expect(
      canManageCalendarEvent("Head", ["Design"], {
        scope: "module",
        module: "Design",
      }),
    ).toBe(true);
    expect(
      canManageCalendarEvent("Head", ["Design"], { scope: "general" }),
    ).toBe(false);
    expect(
      canPublishCalendarEvent("Admin", [], {
        scope: "module",
        module: "Design",
      }),
    ).toBe(true);
  });
  it("returns independently creatable scopes", () => {
    expect(getCreatableCalendarScopes("Admin", [])).toEqual([
      { scope: "general" },
    ]);
    expect(
      getCreatableCalendarScopes("Head", ["Design", "Software Development"]),
    ).toEqual([
      { scope: "module", module: "Design" },
      { scope: "module", module: "Software Development" },
    ]);
  });
});
