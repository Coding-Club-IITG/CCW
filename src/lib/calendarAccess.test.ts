import { describe, expect, it } from "vitest";
import {
  canManageCalendarEvent,
  canPublishCalendarEvent,
  getPublishableEventModules,
  getCreatableCalendarScopes,
} from "@/lib/calendarAccess";

describe("calendar access", () => {
  it("limits module heads' public-event administration to their modules", () => {
    expect(getPublishableEventModules("Head", [{ module: "CP" }])).toEqual([
      "CP",
    ]);
    expect(getPublishableEventModules("Secretary", [])).toBeNull();
  });
  it("lets global administrators manage only general calendar entries", () => {
    expect(canManageCalendarEvent("Secretary", [], { scope: "general" })).toBe(
      true,
    );
    expect(
      canManageCalendarEvent("Secretary", [], {
        scope: "module",
        module: "Design",
      }),
    ).toBe(false);
  });

  it("lets heads manage only their assigned modules", () => {
    const roles = [{ module: "Design" }];
    expect(
      canManageCalendarEvent("Head", roles, {
        scope: "module",
        module: "Design",
      }),
    ).toBe(true);
    expect(
      canManageCalendarEvent("Head", roles, {
        scope: "module",
        module: "Cybersecurity",
      }),
    ).toBe(false);
    expect(canManageCalendarEvent("Head", roles, { scope: "general" })).toBe(
      false,
    );
  });

  it("lets global administrators publish any event and heads publish their module", () => {
    expect(
      canPublishCalendarEvent("OC", [], {
        scope: "module",
        module: "Design",
      }),
    ).toBe(true);
    expect(
      canPublishCalendarEvent("Head", [{ module: "Design" }], {
        scope: "module",
        module: "Design",
      }),
    ).toBe(true);
    expect(
      canPublishCalendarEvent("Head", [{ module: "Design" }], {
        scope: "general",
      }),
    ).toBe(false);
  });

  it("returns only scopes that the user can create", () => {
    expect(getCreatableCalendarScopes("Projects Head", [])).toEqual([
      { scope: "general" },
    ]);
    expect(
      getCreatableCalendarScopes("Head", [
        { module: "Design" },
        { module: "Software Development" },
      ]),
    ).toEqual([
      { scope: "module", module: "Design" },
      { scope: "module", module: "Software Development" },
    ]);
    expect(getCreatableCalendarScopes("Member", [])).toEqual([]);
  });
});
