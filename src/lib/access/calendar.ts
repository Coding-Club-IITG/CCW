import type { ModuleName } from "@/lib/constants";
import { getHeadModules, isAdmin } from "@/lib/access/roles";

export type CalendarScopeTarget =
  { scope: "general"; module?: never } | { scope: "module"; module: string };

export function canManageCalendarEvent(
  access: string | undefined,
  managedModules: ModuleName[],
  target: CalendarScopeTarget,
): boolean {
  if (target.scope === "general") return isAdmin(access);
  return getHeadModules(access, managedModules).includes(
    target.module as ModuleName,
  );
}

export function canPublishCalendarEvent(
  access: string | undefined,
  managedModules: ModuleName[],
  target: CalendarScopeTarget,
): boolean {
  return (
    isAdmin(access) || canManageCalendarEvent(access, managedModules, target)
  );
}

export function getPublishableEventModules(
  access: string | undefined,
  managedModules: ModuleName[],
): string[] | null {
  return isAdmin(access) ? null : getHeadModules(access, managedModules);
}

export function getCreatableCalendarScopes(
  access: string | undefined,
  managedModules: ModuleName[],
): CalendarScopeTarget[] {
  if (isAdmin(access)) return [{ scope: "general" }];
  return getHeadModules(access, managedModules).map((module) => ({
    scope: "module" as const,
    module: module as ModuleName,
  }));
}
