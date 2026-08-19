import type { ModuleName } from "@/lib/constants";

/** Whether access level grants Head-level capabilities */
export function isHead(access?: string): boolean {
  return access === "Head" || access === "Admin";
}

/** Whether access level grants global administrative capabilities */
export function isAdmin(access?: string): boolean {
  return access === "Admin";
}

/** Modules a Head may administer */
export function getHeadModules(
  access?: string,
  managedModules?: readonly ModuleName[],
): ModuleName[] {
  return access === "Head" ? [...(managedModules ?? [])] : [];
}
