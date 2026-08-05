/**
 * Role checking and parsing utilities
 */

import {
  ACCESS_LEVELS,
  AccessLevel,
  CLUB_POSITIONS,
  CURRENT_TENURE,
  MODULE_POSITIONS,
  MODULES,
  ModuleName,
  UserRole,
} from "@/lib/constants";

export function isValidTenure(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  return !!match && (Number(match[1]) + 1) % 100 === Number(match[2]);
}

export function normalizeTenure(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tenure = value.trim();
  return isValidTenure(tenure) ? tenure : null;
}

export function parseAccess(raw: unknown): AccessLevel {
  return ACCESS_LEVELS.includes(raw as AccessLevel)
    ? (raw as AccessLevel)
    : "Member";
}

function isUserRole(value: unknown): value is UserRole {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.position !== "string") return false;
  if (item.module === undefined)
    return CLUB_POSITIONS.includes(item.position as never);
  return (
    MODULES.includes(item.module as ModuleName) &&
    MODULE_POSITIONS.includes(item.position as never)
  );
}

export function parseRoles(raw: unknown): UserRole[] {
  if (!raw) return [];
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.filter(isUserRole) : [];
}

export function parseManagedModules(raw: unknown): ModuleName[] {
  if (!raw) return [];
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((item): item is ModuleName =>
            MODULES.includes(item as ModuleName),
          ),
        ),
      ]
    : [];
}

export function validateRoles(
  raw: unknown,
): { success: true; roles: UserRole[] } | { success: false; error: string } {
  if (!Array.isArray(raw))
    return { success: false, error: "Roles must be an array." };
  if (!raw.every(isUserRole))
    return { success: false, error: "Invalid role combination." };
  const keys = raw.map((role) => `${role.module ?? "club"}:${role.position}`);
  if (new Set(keys).size !== keys.length)
    return { success: false, error: "Duplicate roles are not allowed." };
  return { success: true, roles: raw };
}

// Handles both raw array and stringified form
// Global administrators
export function isHead(access?: string): boolean {
  return access === "Head" || access === "Admin";
}
export function isAdmin(access?: string): boolean {
  return access === "Admin";
}

// Checks if a user can set POTD problems
export function canSetPOTD(access?: string, roles: UserRole[] = []): boolean {
  return (
    isHead(access) ||
    roles.some((role) => role.module && role.position === "Core Team")
  );
}

// List of modules for which user is Head
export function getHeadModules(
  access?: string,
  managedModules?: ModuleName[],
): ModuleName[] {
  return access === "Head" ? (managedModules ?? []) : [];
}
