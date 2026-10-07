import type { ModuleName } from "@/lib/constants";
import { getModules, isAdmin, isHead } from "@/lib/access/roles";

export type CalendarScopeTarget =
  { scope: "general"; module?: never } | { scope: "module"; module: string };

export function canManageCalendarEvent(
  access: string | undefined,
  managedModules: ModuleName[],
  target: CalendarScopeTarget,
): boolean {
  if (!isHead(access)) return false;
  if (target.scope === "general") return isAdmin(access);
  return getModules(access, managedModules).includes(
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
  return isAdmin(access)
    ? null
    : isHead(access)
      ? getModules(access, managedModules)
      : [];
}

export function getCreatableCalendarScopes(
  access: string | undefined,
  managedModules: ModuleName[],
): CalendarScopeTarget[] {
  if (isAdmin(access)) return [{ scope: "general" }];
  if (!isHead(access)) return [];
  return getModules(access, managedModules).map((module) => ({
    scope: "module" as const,
    module: module as ModuleName,
  }));
}
