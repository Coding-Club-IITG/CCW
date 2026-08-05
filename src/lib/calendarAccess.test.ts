import { describe, expect, it } from "vitest";
import {
  canManageCalendarEvent,
  canPublishCalendarEvent,
  getCreatableCalendarScopes,
  getPublishableEventModules,
} from "@/lib/calendarAccess";

describe("calendar access", () => {
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
