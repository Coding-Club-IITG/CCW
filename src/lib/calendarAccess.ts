import type { ModuleName } from "@/lib/constants";
import {
  getHeadModules,
  isGlobalAdmin,
  type ParsedModuleRole,
} from "@/lib/roles";

export type CalendarScopeTarget =
  | { scope: "general"; module?: never }
  | { scope: "module"; module: string };

export function canManageCalendarEvent(
  role: string | undefined,
  moduleRoles: ParsedModuleRole[],
  target: CalendarScopeTarget,
): boolean {
  if (target.scope === "general") return isGlobalAdmin(role);
  return getHeadModules(role, moduleRoles).includes(target.module);
}

export function canPublishCalendarEvent(
  role: string | undefined,
  moduleRoles: ParsedModuleRole[],
  target: CalendarScopeTarget,
): boolean {
  return (
    isGlobalAdmin(role) || canManageCalendarEvent(role, moduleRoles, target)
  );
}

export function getPublishableEventModules(
  role: string | undefined,
  moduleRoles: ParsedModuleRole[],
): string[] | null {
  return isGlobalAdmin(role) ? null : getHeadModules(role, moduleRoles);
}

export function getCreatableCalendarScopes(
  role: string | undefined,
  moduleRoles: ParsedModuleRole[],
): CalendarScopeTarget[] {
  if (isGlobalAdmin(role)) return [{ scope: "general" }];
  return getHeadModules(role, moduleRoles).map((module) => ({
    scope: "module" as const,
    module: module as ModuleName,
  }));
}
