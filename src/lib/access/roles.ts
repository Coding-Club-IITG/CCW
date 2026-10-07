import { MODULES, type ModuleName } from "@/lib/constants";

export function isElevated(access?: string): boolean {
  return access === "Core Team" || access === "Head" || access === "Admin";
}

/** Whether access level grants Head-level capabilities */
export function isHead(access?: string): boolean {
  return access === "Head" || access === "Admin";
}

/** Whether access level grants global administrative capabilities */
export function isAdmin(access?: string): boolean {
  return access === "Admin";
}

/** Module Scope */
export function getModules(
  access?: string,
  managedModules?: readonly ModuleName[],
): ModuleName[] {
  return access === "Head" || access === "Core Team"
    ? [
        ...new Set(
          (managedModules ?? []).filter((module) => MODULES.includes(module)),
        ),
      ]
    : [];
}
